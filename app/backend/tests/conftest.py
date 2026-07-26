import os
import tempfile


os.environ.setdefault("JOBFLOW_DATA_DIR", tempfile.mkdtemp(prefix="jobflow-pytest-"))
