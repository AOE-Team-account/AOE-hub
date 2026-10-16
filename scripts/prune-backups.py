#!/usr/bin/env python3
"""Decides which nightly backups to delete: keep every daily copy for 30 days,
then keep one per week (the Sunday copy) for a year, delete everything else.

Reads the list of object keys as a JSON array on stdin and prints the keys to
delete, one per line. Keys look like backups/daily/aoehub-2026-10-16.sql.gz.
Anything that does not match that pattern is never touched.
"""
import json
import re
import sys
from datetime import date, timedelta

PATTERN = re.compile(r"^backups/daily/aoehub-(\d{4})-(\d{2})-(\d{2})\.sql\.gz$")
DAILY_DAYS = 30
WEEKLY_DAYS = 365


def keys_to_delete(keys, today):
    doomed = []
    for key in keys:
        m = PATTERN.match(key)
        if not m:
            continue
        try:
            d = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            continue
        age = (today - d).days
        if age <= DAILY_DAYS:
            continue
        if age <= WEEKLY_DAYS and d.weekday() == 6:  # Sunday
            continue
        doomed.append(key)
    return doomed


if __name__ == "__main__":
    data = json.load(sys.stdin) or []
    for k in keys_to_delete(data, date.today()):
        print(k)
