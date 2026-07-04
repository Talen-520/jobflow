from __future__ import annotations

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
        return FormSchema(url=url, ats=ats or self._detect_ats(url, html), fields=fields)

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
            return f"#{control['id']}"
        if control.get("name"):
            return f"[name='{control['name']}']"
        return f"[data-jobflow-field='{fallback}']"

    def _detect_ats(self, url: str, html: str) -> str:
        haystack = f"{url} {html}".lower()
        if "greenhouse" in haystack or "boards.greenhouse.io" in haystack:
            return "greenhouse"
        if "lever.co" in haystack or "lever" in haystack:
            return "lever"
        if "ashby" in haystack:
            return "ashby"
        return "generic"

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
                "authorization",
                "salary",
            ]
        )
