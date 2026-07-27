from pathlib import Path

from app.models.schemas import (
    AnswerBankEntry,
    DocumentRecord,
    FieldType,
    Fact,
    FormField,
    FormSchema,
    Preferences,
    UserProfile,
)
from app.services.fill_plan import FillPlanService
from app.services.form_extraction import FormExtractionService


def test_fill_plan_uses_only_profile_and_answer_bank_sources(tmp_path: Path) -> None:
    html = Path("tests/fixtures/generic_application.html").read_text()
    form = FormExtractionService().extract_from_html(html)
    resume = tmp_path / "resume.pdf"
    resume.write_bytes(b"%PDF-1.4 test resume")
    profile = UserProfile(
        identity={
            "first_name": "Tao",
            "last_name": "Hu",
            "email": "tao@example.com",
        },
        links={"linkedin": "https://linkedin.com/in/taohu"},
        documents=[
            DocumentRecord(
                kind="resume",
                name="Resume",
                path=str(resume),
            )
        ],
        answer_bank=[
            AnswerBankEntry(
                question_type="motivation",
                title="AI automation motivation",
                body="I enjoy building automation tools that reduce repetitive manual work.",
                tags=["automation", "ai"],
            )
        ],
        experience_facts=[
            Fact(title="Automation", body="Built local AI workflow tools.")
        ],
    )

    plan = FillPlanService().create_plan(form, profile, Preferences())

    email_item = next(item for item in plan.items if item.field_id == "email")
    assert email_item.value == "tao@example.com"
    assert email_item.selector == "#email"
    assert email_item.source_refs == ["profile.identity.email"]

    resume_item = next(item for item in plan.items if item.field_id == "resume")
    assert resume_item.action == "upload"
    assert resume_item.value == str(resume.resolve())
    assert resume_item.source_refs[0].startswith("profile.documents.")
    assert resume_item.needs_review is False

    motivation_item = next(item for item in plan.items if item.field_id == "motivation")
    assert motivation_item.needs_review is True
    assert motivation_item.source_refs[0].startswith("answer_bank.")
    assert "repetitive manual work" in str(motivation_item.value)

    blocked_ids = {item.field_id for item in plan.blocked_items}
    assert "sponsorship" in blocked_ids


def test_fill_plan_blocks_upload_when_document_file_is_missing(tmp_path: Path) -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="cover_letter",
                label="Cover letter",
                type=FieldType.file,
                selector="#cover_letter",
                required=True,
            )
        ]
    )
    profile = UserProfile(
        documents=[
            DocumentRecord(
                kind="cover_letter",
                name="Cover Letter",
                path=str(tmp_path / "missing-cover-letter.pdf"),
            )
        ]
    )

    plan = FillPlanService().create_plan(form, profile, Preferences())

    assert plan.items == []
    assert plan.blocked_items[0].field_id == "cover_letter"
    assert "missing from local storage" in plan.blocked_items[0].reason


def test_fill_plan_blocks_invalid_profile_email() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="email",
                label="Email",
                type=FieldType.email,
                selector="#email",
                required=True,
            )
        ]
    )
    profile = UserProfile(identity={"email": "not-an-email"})

    plan = FillPlanService().create_plan(form, profile, Preferences())

    assert plan.items == []
    assert plan.blocked_items[0].field_id == "email"
    assert "no matching user-provided fact" in plan.blocked_items[0].reason


def test_fill_plan_maps_plain_name_label_to_complete_identity() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="name",
                label="Name",
                type=FieldType.text,
                selector='[name="_systemfield_name"]',
                required=True,
            )
        ]
    )
    profile = UserProfile(identity={"first_name": "Tao", "last_name": "Hu"})

    plan = FillPlanService().create_plan(form, profile, Preferences())

    assert plan.blocked_items == []
    assert plan.items[0].value == "Tao Hu"
    assert plan.items[0].source_refs == [
        "profile.identity.first_name+profile.identity.last_name"
    ]


def test_fill_plan_maps_workday_identity_and_region_without_guessing_phone_type() -> None:
    form = FormSchema(
        ats="workday",
        fields=[
            FormField(
                field_id="legalName--firstName",
                label="Given Name(s)*",
                type=FieldType.text,
                required=True,
                selector='[name="legalName--firstName"]',
            ),
            FormField(
                field_id="legalName--lastName",
                label="Family Name*",
                type=FieldType.text,
                required=True,
                selector='[name="legalName--lastName"]',
            ),
            FormField(
                field_id="country",
                label="Country / Territory",
                type=FieldType.select,
                required=True,
                selector='[name="country"]',
            ),
            FormField(
                field_id="countryRegion",
                label="Region",
                type=FieldType.select,
                required=True,
                selector='[name="countryRegion"]',
            ),
            FormField(
                field_id="phoneType",
                label="Phone Device Type",
                type=FieldType.select,
                required=False,
                selector='[name="phoneType"]',
            ),
        ],
    )
    profile = UserProfile(
        identity={
            "first_name": "Tao",
            "last_name": "Hu",
            "state": "NY",
            "country": "US",
            "phone": "2125550100",
        }
    )

    plan = FillPlanService().create_plan(form, profile, Preferences())

    items = {item.field_id: item for item in plan.items}
    assert plan.blocked_items == []
    assert items["legalName--firstName"].value == "Tao"
    assert items["legalName--lastName"].value == "Hu"
    assert items["country"].value == "United States"
    assert items["countryRegion"].value == "NY"
    assert items["phoneType"].action == "skip"
    assert items["phoneType"].needs_review is True


def test_fill_plan_maps_workday_repeaters_from_structured_profile_data() -> None:
    form = FormSchema(
        ats="workday",
        fields=[
            FormField(
                field_id="jobflow-workday-work-experience",
                label="Work Experience",
                selector='[data-jobflow-workday-repeater="jobflow-workday-work-experience"]',
            ),
            FormField(
                field_id="jobflow-workday-education",
                label="Education",
            ),
            FormField(
                field_id="jobflow-workday-certifications",
                label="Certifications",
            ),
            FormField(
                field_id="jobflow-workday-websites",
                label="Websites",
            ),
        ],
    )
    profile = UserProfile(
        links={
            "github": "https://github.com/example",
            "portfolio": "https://example.dev",
        },
        experience_facts=[
            Fact(
                title="Site Reliability Engineer",
                body="Operated production services.",
                organization="Example Inc.",
                location="New York, NY",
                start_date="2022-01-15",
                end_date="",
                current=True,
            )
        ],
        education=[
            Fact(
                title="Queens College",
                body="Computer Science",
                degree="Bachelor's Degree",
                start_date="2018-08-20",
                end_date="2022-05-26",
                education_status="graduated",
            )
        ],
        certifications=[
            Fact(
                title="AWS Certified Developer",
                credential_number="ABC-123",
                issued_date="2024-01-15",
                expiration_date="2027-01-15",
            )
        ],
    )

    plan = FillPlanService().create_plan(form, profile, Preferences())

    items = {item.field_id: item for item in plan.items}
    experience = items["jobflow-workday-work-experience"]
    assert experience.action == "repeat"
    assert (
        experience.selector
        == '[data-jobflow-workday-repeater="jobflow-workday-work-experience"]'
    )
    assert experience.value == [
        {
            "job_title": "Site Reliability Engineer",
            "company": "Example Inc.",
            "location": "New York, NY",
            "current": True,
            "start_date": "2022-01",
            "end_date": "",
            "description": "Operated production services.",
        }
    ]

    education = items["jobflow-workday-education"]
    assert education.action == "repeat"
    assert education.value == [
        {
            "school": "Queens College",
            "degree": "Bachelor's Degree",
            "field_of_study": "Computer Science",
            "start_date": "2018-08",
            "end_date": "2022-05",
            "status": "graduated",
        }
    ]

    certifications = items["jobflow-workday-certifications"]
    assert certifications.action == "repeat"
    assert certifications.value == [
        {
            "name": "AWS Certified Developer",
            "number": "ABC-123",
            "issued_date": "2024-01-15",
            "expiration_date": "2027-01-15",
        }
    ]

    websites = items["jobflow-workday-websites"]
    assert websites.action == "repeat"
    assert websites.value == [
        {"url": "https://github.com/example"},
        {"url": "https://example.dev"},
    ]


def test_workday_repeat_plan_ignores_invalid_legacy_dates() -> None:
    form = FormSchema(
        ats="workday",
        fields=[
            FormField(
                field_id="jobflow-workday-work-experience",
                label="Work Experience",
                selector='[data-jobflow-workday-repeater="jobflow-workday-work-experience"]',
            )
        ],
    )
    profile = UserProfile(
        experience_facts=[
            Fact(
                title="Volunteer",
                body="Volunteer",
                start_date="2",
                end_date="not-a-month",
            )
        ]
    )

    plan = FillPlanService().create_plan(form, profile, Preferences())

    assert plan.items[0].value == [
        {
            "job_title": "Volunteer",
            "company": "",
            "location": "",
            "current": False,
            "start_date": "",
            "end_date": "",
            "description": "Volunteer",
        }
    ]


def test_profile_fact_normalizes_legacy_month_values_for_calendar_inputs() -> None:
    fact = Fact(start_date="2021-09", end_date="2024-02")

    assert fact.start_date == "2021-09-01"
    assert fact.end_date == "2024-02-01"


def test_saved_work_authorization_fact_fills_without_per_run_review() -> None:
    html = Path("tests/fixtures/generic_application.html").read_text()
    form = FormExtractionService().extract_from_html(html)
    profile = UserProfile(
        work_authorization={
            "country": "US",
            "authorized": True,
            "requires_sponsorship": False,
        }
    )

    plan = FillPlanService().create_plan(form, profile, Preferences())

    sponsorship_item = next(item for item in plan.items if item.field_id == "sponsorship")
    assert sponsorship_item.action == "select"
    assert sponsorship_item.value == "No"
    assert sponsorship_item.needs_review is False
    assert sponsorship_item.source_refs == [
        "profile.work_authorization.requires_sponsorship"
    ]
    assert "Sensitive work authorization fact" in sponsorship_item.reason
    assert "sponsorship" not in {item.field_id for item in plan.blocked_items}


def test_sensitive_work_authorization_fact_can_fill_when_enabled() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="authorized",
                label="Are you legally authorized to work in the United States?",
                type=FieldType.select,
                required=True,
                options=["Select one", "Yes", "No"],
                selector="#authorized",
                sensitive=True,
            )
        ]
    )
    profile = UserProfile(
        work_authorization={
            "country": "US",
            "authorized": True,
            "requires_sponsorship": False,
        }
    )
    preferences = Preferences(fill_sensitive_fields=True)

    plan = FillPlanService().create_plan(form, profile, preferences)

    assert plan.blocked_items == []
    authorized_item = plan.items[0]
    assert authorized_item.field_id == "authorized"
    assert authorized_item.action == "select"
    assert authorized_item.value == "Yes"
    assert authorized_item.needs_review is False
    assert authorized_item.source_refs == ["profile.work_authorization.authorized"]


def test_work_authorization_does_not_cross_country_boundaries() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="canada_authorized",
                label="Do you have a legal right to work in Canada if hired?",
                type=FieldType.select,
                required=True,
                options=["Yes", "No"],
                selector="#canada_authorized",
                sensitive=True,
            )
        ]
    )
    profile = UserProfile(
        work_authorization={
            "country": "US",
            "authorized": True,
            "requires_sponsorship": False,
        }
    )

    plan = FillPlanService().create_plan(form, profile, Preferences())

    assert plan.items == []
    assert plan.blocked_items[0].field_id == "canada_authorized"
    assert "exact saved Profile value" in plan.blocked_items[0].reason


def test_radio_work_authorization_maps_to_selected_option_when_enabled() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="authorized",
                label="authorized",
                type=FieldType.radio,
                required=True,
                options=["Yes", "No"],
                selector='[name="authorized"]',
                sensitive=True,
            )
        ]
    )
    profile = UserProfile(work_authorization={"country": "", "authorized": True})
    preferences = Preferences(fill_sensitive_fields=True)

    plan = FillPlanService().create_plan(form, profile, preferences)

    assert plan.blocked_items == []
    authorized_item = plan.items[0]
    assert authorized_item.field_id == "authorized"
    assert authorized_item.action == "select"
    assert authorized_item.value == "Yes"
    assert authorized_item.selector == '[name="authorized"]'
    assert authorized_item.needs_review is False


def test_profile_preferences_fill_common_application_fields() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="company",
                label="Current company",
                type=FieldType.text,
                required=False,
                selector="#company",
            ),
            FormField(
                field_id="university",
                label="University",
                type=FieldType.text,
                required=False,
                selector="#university",
            ),
            FormField(
                field_id="source",
                label="Please tell us how you heard about this opportunity.",
                type=FieldType.textarea,
                required=False,
                selector="#source",
            ),
        ]
    )
    profile = UserProfile(
        preferences={
            "company": "AutoJob Labs",
            "university": "Example University",
            "heard_about_opportunity": "LinkedIn",
        }
    )

    plan = FillPlanService().create_plan(form, profile, Preferences())

    assert plan.blocked_items == []
    values = {item.field_id: item.value for item in plan.items}
    assert values == {
        "company": "AutoJob Labs",
        "university": "Example University",
        "source": "LinkedIn",
    }
    source_refs = {item.field_id: item.source_refs for item in plan.items}
    assert source_refs["company"] == ["profile.preferences.company"]
    assert source_refs["university"] == ["profile.preferences.university"]
    assert source_refs["source"] == ["profile.preferences.heard_about_opportunity"]


def test_greenhouse_source_and_optional_cover_letter_are_handled_safely() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="country",
                label="Country",
                type=FieldType.select,
                required=True,
                selector="#country",
            ),
            FormField(
                field_id="source",
                label="How did you initially hear about this job?",
                type=FieldType.select,
                required=True,
                selector="#source",
            ),
            FormField(
                field_id="cover_letter",
                label="Cover Letter",
                type=FieldType.file,
                required=False,
                selector="#cover_letter",
            ),
        ]
    )
    profile = UserProfile(
        identity={"country": "US"},
        preferences={"heard_about_opportunity": "LinkedIn"},
    )

    plan = FillPlanService().create_plan(form, profile, Preferences())

    assert plan.blocked_items == []
    values = {item.field_id: item.value for item in plan.items}
    assert values["country"] == "United States"
    assert values["source"] == "LinkedIn"
    cover_letter = next(item for item in plan.items if item.field_id == "cover_letter")
    assert cover_letter.action == "skip"
    assert cover_letter.needs_review is False


def test_workday_contact_fields_use_precise_profile_sources() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="phoneNumber--countryPhoneCode",
                label="Country / Territory Phone Code",
                type=FieldType.text,
                required=True,
                selector="#phone-code",
            ),
            FormField(
                field_id="phoneNumber",
                label="Phone Number",
                type=FieldType.text,
                required=True,
                selector="#phone",
            ),
            FormField(
                field_id="extension",
                label="Phone Extension",
                type=FieldType.text,
                required=False,
                selector="#extension",
            ),
            FormField(
                field_id="phone-sms-opt-in",
                label="SMS job application updates",
                type=FieldType.checkbox,
                required=False,
                selector="#sms",
            ),
            FormField(
                field_id="addressLine1",
                label="Address Line 1",
                type=FieldType.text,
                required=False,
                selector="#address",
            ),
            FormField(
                field_id="postalCode",
                label="Postal Code",
                type=FieldType.text,
                required=False,
                selector="#postal",
            ),
        ]
    )
    profile = UserProfile(
        identity={
            "phone": "5551234567",
            "phone_country_code": "+1",
            "phone_extension": "42",
            "address": "123 Main St",
            "postal_code": "10001",
        },
        preferences={"sms_opt_in": False},
    )

    plan = FillPlanService().create_plan(form, profile, Preferences())

    assert plan.blocked_items == []
    values = {item.field_id: item.value for item in plan.items}
    assert values == {
        "phoneNumber--countryPhoneCode": "+1",
        "phoneNumber": "5551234567",
        "extension": "42",
        "phone-sms-opt-in": False,
        "addressLine1": "123 Main St",
        "postalCode": "10001",
    }
    refs = {item.field_id: item.source_refs for item in plan.items}
    assert refs["phoneNumber--countryPhoneCode"] == [
        "profile.identity.phone_country_code"
    ]
    assert refs["phone-sms-opt-in"] == ["profile.preferences.sms_opt_in"]


def test_eeo_preferences_are_gated_and_review_required() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="gender",
                label="Gender",
                type=FieldType.select,
                required=False,
                options=["Select one", "Male", "Female", "Non-binary"],
                selector="#gender",
            ),
            FormField(
                field_id="race",
                label="Race or ethnicity",
                type=FieldType.select,
                required=False,
                options=["Select one", "Asian", "White", "Hispanic or Latino"],
                selector="#race",
            ),
            FormField(
                field_id="disability",
                label="Disability status",
                type=FieldType.select,
                required=False,
                options=[
                    "Select one",
                    "Yes, I have a disability",
                    "No, I do not have a disability",
                    "I do not wish to answer",
                ],
                selector="#disability",
            ),
            FormField(
                field_id="veteran",
                label="Veteran status",
                type=FieldType.select,
                required=False,
                options=[
                    "Select one",
                    "I am not a protected veteran",
                    "I identify as one or more classifications of protected veteran",
                    "I do not wish to answer",
                ],
                selector="#veteran",
            ),
        ]
    )
    profile = UserProfile(
        preferences={
            "gender": "Male",
            "race": "Asian",
            "disability_status": "No, I do not have a disability",
            "veteran_status": "I am not a protected veteran",
        }
    )

    plan = FillPlanService().create_plan(form, profile, Preferences())

    assert plan.blocked_items == []
    values = {item.field_id: item.value for item in plan.items}
    assert values == {
        "gender": "Male",
        "race": "Asian",
        "disability": "No, I do not have a disability",
        "veteran": "I am not a protected veteran",
    }
    assert all(not item.needs_review for item in plan.items)
    source_refs = {item.field_id: item.source_refs for item in plan.items}
    assert source_refs["gender"] == ["profile.preferences.gender"]
    assert source_refs["race"] == ["profile.preferences.race"]
    assert source_refs["disability"] == ["profile.preferences.disability_status"]
    assert source_refs["veteran"] == ["profile.preferences.veteran_status"]


def test_eeo_profile_value_maps_to_one_descriptive_radio_option() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="race",
                label="Race",
                type=FieldType.radio,
                required=False,
                options=[
                    "White (Not Hispanic or Latino)",
                    "Asian (Not Hispanic or Latino)",
                    "Decline to self-identify",
                ],
                selector='[data-field-path="_systemfield_eeoc_race"]',
            )
        ]
    )
    profile = UserProfile(preferences={"race": "Asian"})

    plan = FillPlanService().create_plan(form, profile, Preferences())

    assert plan.blocked_items == []
    assert plan.items[0].value == "Asian (Not Hispanic or Latino)"


def test_missing_fact_policy_can_leave_required_field_blank() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="portfolio_url",
                label="Portfolio URL",
                type=FieldType.text,
                required=True,
                selector="#portfolio_url",
            )
        ]
    )
    preferences = Preferences(missing_fact_policy="leave_blank")

    plan = FillPlanService().create_plan(form, UserProfile(), preferences)

    assert plan.blocked_items == []
    blank_item = plan.items[0]
    assert blank_item.field_id == "portfolio_url"
    assert blank_item.action == "skip"
    assert blank_item.value == ""
    assert blank_item.needs_review is False
    assert "missing-fact policy" in blank_item.reason


def test_salary_policy_can_leave_sensitive_salary_blank() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="salary",
                label="Desired salary",
                type=FieldType.text,
                required=True,
                selector="#salary",
                sensitive=True,
            )
        ]
    )
    preferences = Preferences(salary_answer_policy="leave_blank")

    plan = FillPlanService().create_plan(form, UserProfile(), preferences)

    assert plan.blocked_items == []
    salary_item = plan.items[0]
    assert salary_item.action == "skip"
    assert salary_item.needs_review is False
    assert "salary policy" in salary_item.reason


def test_salary_policy_uses_exact_saved_profile_preference() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="salary",
                label="Desired compensation",
                type=FieldType.text,
                required=True,
                selector="#salary",
                sensitive=True,
            )
        ]
    )
    profile = UserProfile(preferences={"salary": "$120,000 base"})
    preferences = Preferences(salary_answer_policy="use_profile")

    plan = FillPlanService().create_plan(form, profile, preferences)

    assert plan.blocked_items == []
    salary_item = plan.items[0]
    assert salary_item.action == "fill"
    assert salary_item.value == "$120,000 base"
    assert salary_item.needs_review is False
    assert salary_item.source_refs == ["profile.preferences.salary"]


def test_missing_fact_policy_can_leave_open_question_blank() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="why_us",
                label="Why do you want to work here?",
                type=FieldType.textarea,
                required=True,
                selector="#why_us",
            )
        ]
    )
    preferences = Preferences(missing_fact_policy="leave_blank")

    plan = FillPlanService().create_plan(form, UserProfile(), preferences)

    assert plan.blocked_items == []
    open_item = plan.items[0]
    assert open_item.action == "skip"
    assert open_item.needs_review is False
    assert "no answer bank or profile fact matched" in open_item.reason


def test_low_confidence_policy_can_leave_open_fact_draft_blank() -> None:
    form = FormSchema(
        fields=[
            FormField(
                field_id="automation_story",
                label="Describe your automation experience",
                type=FieldType.textarea,
                required=True,
                selector="#automation_story",
            )
        ]
    )
    profile = UserProfile(
        experience_facts=[
            Fact(
                title="Automation",
                body="Built local workflow automation for job applications.",
                tags=["automation"],
            )
        ]
    )
    preferences = Preferences(low_confidence_policy="leave_blank")

    plan = FillPlanService().create_plan(form, profile, preferences)

    assert plan.blocked_items == []
    open_item = plan.items[0]
    assert open_item.action == "skip"
    assert open_item.source_refs == []
    assert "low-confidence policy" in open_item.reason
