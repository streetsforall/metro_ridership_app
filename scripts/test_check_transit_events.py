"""
Tests for check_transit_events.py.

Covers the pure date/ridership logic with tiny in-memory fixtures — no network
and no real data files, so `known_route_ids` is passed explicitly.
"""

from check_transit_events import (
    check_events,
    dataset_month_bounds,
    first_nonzero_month,
    month_diff,
    month_int,
)


def rec(year, month, line, wk=0, sa=0, su=0):
    return {
        "year": year,
        "month": month,
        "line_name": line,
        "est_wkday_ridership": wk,
        "est_sat_ridership": sa,
        "est_sun_ridership": su,
    }


# A padded series for line 807: zeros from the 2009 dataset start, real
# ridership from 2022-10 (the K Line's true opening month).
RECORDS = [
    rec(2009, 1, 807, 0, 0, 0),
    rec(2015, 6, 807, 0, 0, 0),
    rec(2022, 10, 807, 5000, 3000, 2000),
    rec(2026, 5, 807, 6000, 3500, 2500),
    # line 804 reports from the dataset start (no opening signal)
    rec(2009, 1, 804, 4000, 2000, 1500),
]


def test_month_int():
    assert month_int("2026-05") == 202605
    assert month_int("2012-04") == 201204


def test_month_diff_across_year_boundary():
    assert month_diff(202301, 202212) == 1
    assert month_diff(202210, 202210) == 0
    assert month_diff(202605, 202405) == 24


def test_dataset_month_bounds():
    assert dataset_month_bounds(RECORDS) == (200901, 202605)


def test_first_nonzero_month_skips_padded_zeros():
    # 200901 and 201506 are zero-padded; first real month is 2022-10.
    assert first_nonzero_month(RECORDS, 807) == 202210


def test_first_nonzero_month_returns_none_when_absent():
    assert first_nonzero_month(RECORDS, 999) is None


def test_correct_opening_is_ok():
    events = [
        {"id": "k", "date": "2022-10", "line_ids": [807], "category": "opening"},
    ]
    findings = check_events(events, RECORDS, known_route_ids={807, 804})
    assert ("OK", "k: 2022-10 matches first ridership month 202210") in findings
    assert not [f for f in findings if f[0] == "FAIL"]


def test_wrong_opening_is_flagged_fail():
    events = [
        {"id": "k", "date": "2021-10", "line_ids": [807], "category": "opening"},
    ]
    findings = check_events(events, RECORDS, known_route_ids={807, 804})
    fails = [f for f in findings if f[0] == "FAIL"]
    assert len(fails) == 1
    assert "12 months off" in fails[0][1]


def test_extension_is_manual():
    events = [
        {"id": "d", "date": "2026-05", "line_ids": [805], "category": "extension"},
    ]
    findings = check_events(events, RECORDS, known_route_ids={805})
    assert any(level == "MANUAL" and "d:" in msg for level, msg in findings)


def test_line_present_from_start_has_no_signal():
    events = [
        {"id": "e", "date": "2012-04", "line_ids": [804], "category": "opening"},
    ]
    findings = check_events(events, RECORDS, known_route_ids={804})
    assert any(level == "INFO" and "no opening signal" in msg for level, msg in findings)
    assert not [f for f in findings if f[0] == "FAIL"]


def test_unknown_line_id_warns():
    events = [
        {"id": "x", "date": "2022-10", "line_ids": [999], "category": "opening"},
    ]
    findings = check_events(events, RECORDS, known_route_ids={807, 804})
    assert any(level == "WARN" and "999" in msg for level, msg in findings)


def test_referential_check_skipped_without_feed():
    events = [
        {"id": "x", "date": "2022-10", "line_ids": [999], "category": "opening"},
    ]
    findings = check_events(events, RECORDS, known_route_ids=None)
    # No WARN about the unknown route when the feed is unavailable.
    assert not any(level == "WARN" and "999" in msg for level, msg in findings)


def test_future_dated_event_warns():
    events = [
        {"id": "future", "date": "2030-01", "line_ids": [807], "category": "opening"},
    ]
    findings = check_events(events, RECORDS, known_route_ids={807})
    assert any(level == "WARN" and "past the latest" in msg for level, msg in findings)
