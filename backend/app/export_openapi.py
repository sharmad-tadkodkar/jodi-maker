"""Write the OpenAPI contract to stdout: `uv run python -m app.export_openapi > ../frontend/openapi.json`."""
import json

from app.main import app

print(json.dumps(app.openapi(), indent=2))
