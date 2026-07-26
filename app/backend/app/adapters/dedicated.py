from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.adapters.base import ApplicationAdapter
from app.models.schemas import FillPlan, FillResult, FormField, FormSchema, SuccessDetectionRequest
from app.services.form_extraction import FormExtractionService, _HTMLFormParser
from app.services.safe_fill import SafeFillExecutor
from app.services.success_detection import SuccessDetectionService


@dataclass(frozen=True)
class DedicatedAdapterConfig:
    name: str
    root_selectors: tuple[str, ...]
    field_container_selector: str
    id_aliases: dict[str, str] = field(default_factory=dict)
    field_labels: dict[str, str] = field(default_factory=dict)
    id_attrs: tuple[str, ...] = ()
    selector_attrs: tuple[str, ...] = ()
    ignore_tokens: tuple[str, ...] = ()
    title_selectors: tuple[str, ...] = ("h1",)
    company_selectors: tuple[str, ...] = ()
    success_phrases: tuple[str, ...] = ()
    success_url_tokens: tuple[str, ...] = ()

    def dom_payload(self) -> dict[str, Any]:
        return {
            "ats": self.name,
            "rootSelectors": list(self.root_selectors),
            "fieldContainerSelector": self.field_container_selector,
            "idAliases": self.id_aliases,
            "fieldLabels": self.field_labels,
            "idAttrs": list(self.id_attrs),
            "selectorAttrs": list(self.selector_attrs),
            "ignoreTokens": list(self.ignore_tokens),
            "titleSelectors": list(self.title_selectors),
            "companySelectors": list(self.company_selectors),
        }


class DedicatedHTMLFormExtractionService(FormExtractionService):
    def __init__(self, config: DedicatedAdapterConfig) -> None:
        self.config = config

    def _include_control(self, control: dict[str, Any]) -> bool:
        if not super()._include_control(control):
            return False
        identity = " ".join(
            str(control.get(key, ""))
            for key in ["id", "name", "aria-label", "data-automation-id", "type"]
        ).lower()
        return not any(token in identity for token in self.config.ignore_tokens)

    def _field_id(self, control: dict[str, Any], index: int) -> str:
        candidates = [control.get(attr, "") for attr in self.config.id_attrs]
        candidates.extend([control.get("name", ""), control.get("id", "")])
        raw = next((str(value) for value in candidates if value), f"field_{index}")
        return self.config.id_aliases.get(raw, raw)

    def _selector(self, control: dict[str, Any], fallback: str) -> str:
        for attr in self.config.selector_attrs:
            value = control.get(attr, "")
            if value:
                return f'[{attr}="{self._css_attr_value(value)}"]'
        return super()._selector(control, fallback)

    def _control_label(
        self, parser: _HTMLFormParser, control: dict[str, Any]
    ) -> str:
        label = super()._control_label(parser, control)
        candidates = [control.get(attr, "") for attr in self.config.id_attrs]
        candidates.extend([control.get("name", ""), control.get("id", "")])
        raw = next((str(value) for value in candidates if value), "")
        field_id = self.config.id_aliases.get(raw, raw)
        return self.config.field_labels.get(field_id, label)

    def _looks_sensitive(self, label: str) -> bool:
        normalized = label.lower()
        return super()._looks_sensitive(label) or any(
            token in normalized for token in ["password", "secret", "account creation"]
        )

    def _control_options(self, control: dict[str, Any]) -> list[str]:
        return [
            option
            for option in super()._control_options(control)
            if option.strip().lower() not in {"select", "select one", "select...", "choose"}
        ]


class DedicatedSafeFillExecutor(SafeFillExecutor):
    def __init__(self, ats: str, min_confidence: float = 0.85) -> None:
        super().__init__(min_confidence=min_confidence)
        self.ats = ats

    async def _apply_item(
        self, page, selector: str, item, field: FormField | None = None
    ) -> None:
        locator = page.locator(selector)
        if item.action == "select" and field is not None:
            if self.ats == "ashby" and field.type.value == "radio":
                button = locator.get_by_role(
                    "button", name=self._string_value(item.value), exact=True
                )
                if await button.count() != 1:
                    raise ValueError("Ashby choice button was not uniquely located.")
                await button.click()
                return
            role = await locator.get_attribute("role")
            tag = await locator.evaluate("element => element.tagName.toLowerCase()")
            if role == "combobox" and tag != "select":
                await locator.click()
                option = page.get_by_role(
                    "option", name=self._string_value(item.value), exact=True
                )
                if await option.count() != 1:
                    raise ValueError(f"{self.ats} combobox option was not uniquely located.")
                await option.click()
                return
        await super()._apply_item(page, selector, item, field)

    async def _verify_item(
        self, page, selector: str, item, field: FormField | None = None
    ) -> bool:
        locator = page.locator(selector)
        if item.action == "select" and field is not None:
            if self.ats == "ashby" and field.type.value == "radio":
                return bool(
                    await locator.evaluate(
                        """
                        (element, value) => {
                          const expected = String(value).trim().toLowerCase();
                          const button = Array.from(element.querySelectorAll('button')).find(
                            item => (item.textContent || '').trim().toLowerCase() === expected
                          );
                          if (!button) return false;
                          const state = `${button.getAttribute('aria-pressed') || ''} ${button.getAttribute('data-state') || ''} ${button.className || ''}`.toLowerCase();
                          const native = element.querySelector('input[type="checkbox"], input[type="radio"]');
                          return state.includes('true') || state.includes('checked') || state.includes('selected') || Boolean(native && native.checked);
                        }
                        """,
                        item.value,
                    )
                )
            role = await locator.get_attribute("role")
            tag = await locator.evaluate("element => element.tagName.toLowerCase()")
            if role == "combobox" and tag != "select":
                return (await locator.input_value()).strip().lower() == self._string_value(
                    item.value
                ).strip().lower()
        return await super()._verify_item(page, selector, item, field)


class DedicatedApplicationAdapter(ApplicationAdapter):
    config: DedicatedAdapterConfig

    async def extract_form(self, page) -> FormSchema:
        context = await self.resolve_context(page)
        if hasattr(context, "evaluate"):
            try:
                payload = await context.evaluate(DOM_EXTRACTION_SCRIPT, self.config.dom_payload())
                return FormSchema.model_validate(payload)
            except Exception:
                pass
        html = await context.content()
        return DedicatedHTMLFormExtractionService(self.config).extract_from_html(
            html,
            url=getattr(context, "url", getattr(page, "url", "")),
            ats=self.config.name,
        )

    async def apply_fill_plan(
        self,
        page,
        plan: FillPlan,
        form: FormSchema | None = None,
        dry_run: bool = False,
    ) -> FillResult:
        executor = DedicatedSafeFillExecutor(self.config.name)
        if dry_run:
            return executor.preview(plan)
        context = await self.resolve_context(page)
        return await executor.apply(context, plan, form)

    async def detect_success(self, page):
        context = await self.resolve_context(page)
        html = await context.content()
        url = getattr(context, "url", getattr(page, "url", ""))
        return SuccessDetectionService(
            extra_phrases=self.config.success_phrases,
            url_tokens=self.config.success_url_tokens,
            signal_prefix=self.config.name,
        ).detect(SuccessDetectionRequest(url=url, html=html, ats=self.config.name))

    async def resolve_context(self, page):
        return page


DOM_EXTRACTION_SCRIPT = r"""
(config) => {
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const attrEscape = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const firstMatch = (selectors, scope = document) => {
    for (const selector of selectors || []) {
      const match = scope.querySelector(selector);
      if (match) return match;
    }
    return null;
  };
  const root = firstMatch(config.rootSelectors) || document;
  const containers = config.fieldContainerSelector
    ? Array.from(root.querySelectorAll(config.fieldContainerSelector))
    : [];
  const fields = [];
  const seen = new Map();
  const booleanPaths = new Set();
  const sensitiveTerms = ['gender', 'man', 'woman', 'non-binary', 'transgender', 'race', 'ethnicity', 'asian', 'american indian', 'alaska native', 'african american', 'native hawaiian', 'pacific islander', 'hispanic', 'latino', 'sexual orientation', 'under 30', 'over 30', 'veteran', 'disability', 'sponsorship', 'visa', 'authorized', 'authorization', 'salary', 'compensation', 'relocation', 'birth', 'ssn', 'password'];
  const isSensitive = text => {
    const normalized = text.toLowerCase();
    return sensitiveTerms.some(term =>
      term === 'man'
        ? normalized.split(/[^a-z0-9]+/).includes('man')
        : normalized.includes(term)
    );
  };

  const containerLabel = (container) => {
    if (!container) return '';
    const label = container.querySelector('legend, .ashby-application-form-question-title, label, [data-automation-id^="formLabel"], [class*="label"]');
    return clean(label && label.textContent);
  };
  const helperText = (container) => {
    if (!container) return '';
    const helper = container.querySelector('.ashby-application-form-question-description, [data-automation-id*="help"], [class*="instruction"], [class*="description"]');
    return clean(helper && helper.textContent);
  };
  const labelFor = (control, container) => {
    const aria = clean(control.getAttribute('aria-label'));
    if (aria) return aria;
    const labelledBy = clean(control.getAttribute('aria-labelledby'));
    if (labelledBy) {
      const text = labelledBy.split(/\s+/).map(id => clean(document.getElementById(id)?.textContent)).filter(Boolean).join(' ');
      if (text) return text;
    }
    if (control.id) {
      const label = Array.from(document.querySelectorAll('label')).find(item => item.htmlFor === control.id);
      if (label) return clean(label.textContent);
    }
    return containerLabel(container) || clean(control.getAttribute('placeholder')) || clean(control.getAttribute('name')) || clean(control.id);
  };
  const rawIdentity = (control, container, index) => {
    for (const attr of config.idAttrs || []) {
      const value = clean(control.getAttribute(attr)) || clean(container && container.getAttribute(attr));
      if (value) return value;
    }
    return clean(control.getAttribute('name')) || clean(control.id) || `field_${index}`;
  };
  const normalizedIdentity = (raw) => config.idAliases[raw] || raw;
  const selectorFor = (control, container, fallback) => {
    for (const attr of config.selectorAttrs || []) {
      const own = clean(control.getAttribute(attr));
      if (own) return `[${attr}="${attrEscape(own)}"]`;
      const parent = clean(container && container.getAttribute(attr));
      if (parent) {
        const suffix = control.tagName.toLowerCase();
        return `[${attr}="${attrEscape(parent)}"] ${suffix}`;
      }
    }
    if (control.id) return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(control.id) ? `#${control.id}` : `[id="${attrEscape(control.id)}"]`;
    const name = clean(control.getAttribute('name'));
    if (name) return `[name="${attrEscape(name)}"]`;
    return `[data-jobflow-field="${attrEscape(fallback)}"]`;
  };
  const fieldType = (control) => {
    const tag = control.tagName.toLowerCase();
    const type = clean(control.getAttribute('type')).toLowerCase();
    const role = clean(control.getAttribute('role')).toLowerCase();
    const popup = clean(control.getAttribute('aria-haspopup')).toLowerCase();
    if (role === 'combobox' || popup === 'listbox' || tag === 'select') return 'select';
    if (tag === 'textarea') return 'textarea';
    if (type === 'email') return 'email';
    if (type === 'tel') return 'tel';
    if (type === 'radio') return 'radio';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'file') return 'file';
    if (type === 'text' || !type) return 'text';
    return 'unknown';
  };
  const addField = (field) => {
    if (!field.field_id || !field.label || field.field_id.startsWith('field_')) return;
    const existing = seen.get(field.field_id);
    if (existing && field.type === 'radio') {
      for (const option of field.options || []) if (!existing.options.includes(option)) existing.options.push(option);
      existing.required = existing.required || field.required;
      return;
    }
    if (existing) return;
    seen.set(field.field_id, field);
    fields.push(field);
  };

  for (const container of containers) {
    const buttons = Array.from(container.querySelectorAll('button'));
    const choices = buttons.map(button => clean(button.textContent)).filter(value => ['yes', 'no'].includes(value.toLowerCase()));
    const path = clean(container.getAttribute('data-field-path'));
    if (path && choices.length >= 2) {
      booleanPaths.add(path);
      const fieldId = normalizedIdentity(path);
      const label = containerLabel(container);
      addField({
        field_id: fieldId,
        label,
        type: 'radio',
        required: /\*$/.test(label) || Boolean(container.querySelector('[required], [aria-required="true"]')),
        options: Array.from(new Set(choices)),
        placeholder: '',
        helper_text: helperText(container),
        selector: `[data-field-path="${attrEscape(path)}"]`,
        sensitive: isSensitive(`${label} ${fieldId}`),
      });
    }
  }

  const controls = Array.from(root.querySelectorAll(
    'input, textarea, select, [role="combobox"], button[aria-haspopup="listbox"], [role="button"][aria-haspopup="listbox"]'
  ));
  controls.forEach((control, index) => {
    const type = clean(control.getAttribute('type')).toLowerCase();
    const role = clean(control.getAttribute('role')).toLowerCase();
    const popup = clean(control.getAttribute('aria-haspopup')).toLowerCase();
    const identityText = `${control.id} ${control.getAttribute('name') || ''} ${control.getAttribute('aria-label') || ''} ${control.getAttribute('data-automation-id') || ''} ${type}`.toLowerCase();
    if (['hidden', 'submit', 'reset', 'search'].includes(type)) return;
    if (type === 'button' && role !== 'combobox' && popup !== 'listbox') return;
    if ((config.ignoreTokens || []).some(token => identityText.includes(token))) return;
    if (control.disabled) return;
    const container = config.fieldContainerSelector ? control.closest(config.fieldContainerSelector) : null;
    const path = clean(container && container.getAttribute('data-field-path'));
    if (path && booleanPaths.has(path)) return;
    const raw = rawIdentity(control, container, index);
    const fieldId = normalizedIdentity(raw);
    const label = config.fieldLabels[fieldId] || labelFor(control, container);
    const kind = fieldType(control);
    const declaredOptions = clean(control.getAttribute('data-options')).split('|').map(clean).filter(Boolean);
    const options = kind === 'select'
      ? Array.from(new Set([
          ...Array.from(control.querySelectorAll('option')).map(option => clean(option.value || option.textContent)),
          ...declaredOptions,
        ])).filter(value => value && !['select', 'select one', 'select...', 'choose'].includes(value.toLowerCase()))
      : kind === 'radio'
        ? [clean(control.value || label)].filter(Boolean)
        : declaredOptions;
    addField({
      field_id: fieldId,
      label,
      type: kind,
      required: control.required || control.getAttribute('aria-required') === 'true' || /\*$/.test(label),
      options,
      placeholder: clean(control.getAttribute('placeholder')),
      helper_text: helperText(container) || clean(control.getAttribute('title')),
      selector: selectorFor(control, container, fieldId),
      sensitive: isSensitive(`${label} ${fieldId} ${type}`),
    });
  });

  const companyElement = firstMatch(config.companySelectors);
  const ignoredTitleText = [
    'are you still with us',
    'create account',
    'sign in',
    'apply for job',
    'work summary',
  ];
  let jobTitle = '';
  for (const selector of [...(config.titleSelectors || []), 'h1', 'h2']) {
    for (const element of Array.from(document.querySelectorAll(selector))) {
      const candidate = clean(element.textContent);
      if (
        candidate &&
        !ignoredTitleText.some(ignored => candidate.toLowerCase().startsWith(ignored))
      ) {
        jobTitle = candidate;
        break;
      }
    }
    if (jobTitle) break;
  }
  let company = clean(companyElement && companyElement.textContent);
  const pageTitle = clean(document.title);
  const applicationMatch = pageTitle.match(/job application for\s+(.+?)\s+at\s+(.+)/i);
  if (applicationMatch) {
    jobTitle ||= clean(applicationMatch[1]);
    company ||= clean(applicationMatch[2]);
  }
  if (!company && pageTitle.includes(' - ')) {
    const parts = pageTitle.split(' - ').map(clean).filter(Boolean);
    if (parts.length >= 2) {
      if (config.ats === 'oracle') jobTitle = parts[0];
      else jobTitle ||= parts[0];
      company = parts.slice(1).join(' - ');
    }
  }
  const titleCaseSlug = value => clean(decodeURIComponent(value || '').replace(/[-_]+/g, ' '))
    .replace(/\b\w/g, letter => letter.toUpperCase());
  if (!company && config.ats === 'ashby') {
    const segment = location.pathname.split('/').filter(Boolean)[0];
    if (segment && segment.toLowerCase() !== 'application') company = titleCaseSlug(segment);
  }
  if (!company && config.ats === 'oracle') {
    const siteMatch = location.pathname.match(/\/sites\/([^/]+)/i);
    if (siteMatch) company = titleCaseSlug(siteMatch[1]);
  }
  if (!company && config.ats === 'workday') {
    const tenantMatch = location.hostname.match(/^([^.]+)\.wd\d*\./i);
    if (tenantMatch) company = titleCaseSlug(tenantMatch[1]);
  }
  company = company.replace(/\s+(careers?|jobs?|job board)$/i, '').trim();
  if (!jobTitle && pageTitle) jobTitle = pageTitle;
  return {
    url: location.href,
    ats: config.ats,
    company_name_hint: company,
    job_title_hint: jobTitle,
    fields,
  };
}
"""
