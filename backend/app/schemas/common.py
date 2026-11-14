from datetime import UTC, datetime
from typing import Annotated

from pydantic import AfterValidator


def _assume_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


# SQLite stores datetimes without a timezone. Tagging them as UTC on the way out means the
# JSON always ends in "Z", so the browser doesn't mistake them for local time.
UTCDatetime = Annotated[datetime, AfterValidator(_assume_utc)]
