from __future__ import annotations

import re
from html import unescape
from html.parser import HTMLParser
from typing import Any

from app.models.schemas import FieldType, FormField, FormSchema


class _HTMLFormParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.labels: dict[str, str] = {}
        self.controls: list[dict[str, Any]] = []
        self._label_for: str | None = None
        self._label_text: list[str] = []
        self._select_index: int | None = None
        self._option_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = {key: value or "" for key, value in attrs}
        if tag == "label":
            self._label_for = attr.get("for") or None
            self._label_text = []
        elif tag in {"input", "textarea", "select"}:
            control = {"tag": tag, **attr, "options": []}
            if self._label_for is None and self._label_text:
                control["nested_label"] = " ".join(self._label_text).strip()
            self.controls.append(control)
            if tag == "select":
                self._select_index = len(self.controls) - 1
        elif tag == "option" and self._select_index is not None:
            self._option_text = []
            value = attr.get("value", "")
            if value:
                self.controls[self._select_index]["options"].append(value)

    def handle_endtag(self, tag: str) -> None:
        if tag == "label":
            if self._label_for:
                self.labels[self._label_for] = " ".join(self._label_text).strip()
            self._label_for = None
            self._label_text = []
        elif tag == "select":
            self._select_index = None
        elif tag == "option":
            text = " ".join(self._option_text).strip()
            if text and self._select_index is not None:
                options = self.controls[self._select_index]["options"]
                if text not in options:
                    options.append(text)
            self._option_text = []

    def handle_data(self, data: str) -> None:
        text = data.strip()
        if not text:
            return
        if self._label_for is not None:
            self._label_text.append(text)
        if self._select_index is not None:
            self._option_text.append(text)


class FormExtractionService:
    def extract_from_html(
        self, html: str, url: str = "", ats: str | None = None
    ) -> FormSchema:
        parser = _HTMLFormParser()
        parser.feed(html)
        fields: list[FormField] = []
        radio_fields: dict[str, FormField] = {}
        for index, control in enumerate(parser.controls):
            input_type = control.get("type", control["tag"]).lower()
            if input_type in {"hidden", "submit", "button", "reset"}:
                continue
            field_type = self._field_type(control["tag"], input_type)
            html_id = control.get("id", "")
            name = control.get("name", "")
            label = (
                parser.labels.get(html_id)
                or control.get("nested_label", "")
                or control.get("aria-label", "")
                or control.get("placeholder", "")
                or name
                or html_id
            )
            field_id = name or html_id or f"field_{index}"
            if field_type == FieldType.radio:
                radio_field = radio_fields.get(field_id)
                option = self._radio_option(control, label)
                if radio_field is None:
                    radio_field = FormField(
                        field_id=field_id,
                        label=self._radio_group_label(field_id, label),
                        type=FieldType.radio,
                        required="required" in control,
                        options=[],
                        placeholder=control.get("placeholder", ""),
                        helper_text=control.get("title", ""),
                        selector=self._radio_group_selector(control, field_id),
                        sensitive=self._looks_sensitive(f"{label} {field_id}"),
                    )
                    radio_fields[field_id] = radio_field
                    fields.append(radio_field)
                radio_field.required = radio_field.required or "required" in control
                radio_field.sensitive = radio_field.sensitive or self._looks_sensitive(
                    f"{label} {field_id}"
                )
                if option and option not in radio_field.options:
                    radio_field.options.append(option)
                continue
            fields.append(
                FormField(
                    field_id=field_id,
                    label=label,
                    type=field_type,
                    required="required" in control,
                    options=control.get("options", []),
                    placeholder=control.get("placeholder", ""),
                    helper_text=control.get("title", ""),
                    selector=self._selector(control, field_id),
                    sensitive=self._looks_sensitive(label),
                )
            )
        title = self._extract_tag_text(html, "title")
        heading = self._extract_tag_text(html, "h1")
        company_hint, title_hint = self._extract_record_hints(title, heading)
        return FormSchema(
            url=url,
            ats=ats or self._detect_ats(url, html),
            company_name_hint=company_hint,
            job_title_hint=title_hint,
            fields=fields,
        )

    def _field_type(self, tag: str, input_type: str) -> FieldType:
        if tag == "textarea":
            return FieldType.textarea
        if tag == "select":
            return FieldType.select
        mapping = {
            "email": FieldType.email,
            "tel": FieldType.tel,
            "radio": FieldType.radio,
            "checkbox": FieldType.checkbox,
            "file": FieldType.file,
            "text": FieldType.text,
        }
        return mapping.get(input_type, FieldType.unknown)

    def _selector(self, control: dict[str, Any], fallback: str) -> str:
        if control.get("id"):
            html_id = control["id"]
            if re.match(r"^[A-Za-z_][A-Za-z0-9_-]*$", html_id):
                return f"#{html_id}"
            return f"[id=\"{self._css_attr_value(html_id)}\"]"
        if control.get("name"):
            return f"[name=\"{self._css_attr_value(control['name'])}\"]"
        return f"[data-jobflow-field='{fallback}']"

    def _radio_group_selector(self, control: dict[str, Any], fallback: str) -> str:
        if control.get("name"):
            return f"[name=\"{self._css_attr_value(control['name'])}\"]"
        return self._selector(control, fallback)

    def _radio_option(self, control: dict[str, Any], label: str) -> str:
        return self._clean_text(control.get("value") or label)

    def _radio_group_label(self, field_id: str, first_label: str) -> str:
        cleaned = self._clean_text(first_label).lower()
        if cleaned in {"yes", "no", "true", "false", "1", "0"}:
            return field_id.replace("_", " ").replace("-", " ").strip()
        return first_label

    def _css_attr_value(self, value: str) -> str:
        return value.replace("\\", "\\\\").replace('"', '\\"')

    def _detect_ats(self, url: str, html: str) -> str:
        haystack = f"{url} {html}".lower()
        if "greenhouse" in haystack or "boards.greenhouse.io" in haystack:
            return "greenhouse"
        if "lever.co" in haystack or "lever" in haystack:
            return "lever"
        if "ashby" in haystack:
            return "ashby"
        if "myworkdayjobs.com" in haystack or "workday" in haystack:
            return "workday"
        if "oraclecloud.com" in haystack or "taleo.net" in haystack or "oracle recruiting" in haystack:
            return "oracle"
        return "generic"

    def _extract_record_hints(self, title: str, heading: str) -> tuple[str, str]:
        title = self._clean_text(title)
        heading = self._clean_text(heading)
        company = ""
        job_title = ""
        for delimiter in [" - ", " | ", " at "]:
            if delimiter in title:
                left, right = title.split(delimiter, 1)
                job_title = self._clean_title_candidate(left)
                company = self._clean_company_candidate(right)
                break
        if not job_title:
            job_title = self._clean_title_candidate(heading or title)
        return company, job_title

    def _extract_tag_text(self, html: str, tag: str) -> str:
        match = re.search(rf"<{tag}[^>]*>(.*?)</{tag}>", html, re.I | re.S)
        if not match:
            return ""
        return self._clean_text(match.group(1))

    def _clean_text(self, value: str) -> str:
        without_tags = re.sub(r"<[^>]+>", " ", value)
        return re.sub(r"\s+", " ", unescape(without_tags)).strip()

    def _clean_title_candidate(self, value: str) -> str:
        value = self._clean_text(value)
        if value.lower() in {"application", "job application", "workday application"}:
            return ""
        return value

    def _clean_company_candidate(self, value: str) -> str:
        value = self._clean_text(value)
        return re.sub(
            r"\s+(careers?|jobs?|job board|applications?)$",
            "",
            value,
            flags=re.I,
        ).strip()

    def _looks_sensitive(self, label: str) -> bool:
        normalized = label.lower()
        return any(
            term in normalized
            for term in [
                "gender",
                "race",
                "ethnicity",
                "veteran",
                "disability",
                "sponsorship",
                "visa",
                "authorized",
                "authorization",
                "salary",
            ]
        )
