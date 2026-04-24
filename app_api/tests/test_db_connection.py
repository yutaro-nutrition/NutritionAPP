from app.db.session import check_db_connection
import pytest

pytestmark = pytest.mark.integration


def test_db_connection() -> None:
    assert check_db_connection() is True
