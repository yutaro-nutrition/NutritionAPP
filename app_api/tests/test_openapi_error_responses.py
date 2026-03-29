from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_openapi_recipes_detail_includes_404_response() -> None:
    payload = client.get("/openapi.json")
    assert payload.status_code == 200
    openapi = payload.json()

    get_recipe = openapi["paths"]["/recipes/{recipe_id}"]["get"]
    responses = get_recipe["responses"]

    assert "404" in responses
    assert "422" in responses
    assert responses["404"]["description"] == "Recipe not found for the given recipe_id."


def test_openapi_menu_generate_includes_400_and_404_responses() -> None:
    payload = client.get("/openapi.json")
    assert payload.status_code == 200
    openapi = payload.json()

    generate_menu = openapi["paths"]["/menu/generate"]["post"]
    responses = generate_menu["responses"]

    assert "400" in responses
    assert "404" in responses
    assert "422" in responses
    assert responses["400"]["description"] == "Bad request (e.g., invalid slot configuration)."
    assert responses["404"]["description"] == "No candidate menus satisfy required constraints."


def test_openapi_error_response_has_error_code_field() -> None:
    payload = client.get("/openapi.json")
    assert payload.status_code == 200
    openapi = payload.json()
    error_schema = openapi["components"]["schemas"]["ErrorResponse"]
    assert "error_code" in error_schema["properties"]


def test_openapi_includes_vocabulary_guidance() -> None:
    payload = client.get("/openapi.json")
    assert payload.status_code == 200
    openapi = payload.json()

    recipes_params = openapi["paths"]["/recipes"]["get"]["parameters"]
    meal_type_param = next(item for item in recipes_params if item["name"] == "meal_type")
    tags_param = next(item for item in recipes_params if item["name"] == "tags")
    assert "Recommended values" in meal_type_param["description"]
    assert "GET /meta/options" in tags_param["description"]

    menu_schema = openapi["components"]["schemas"]["MenuRequest"]["properties"]
    assert "Recommended codes" in menu_schema["meal_type"]["description"]
    assert "Recommended codes" in menu_schema["scene"]["description"]
