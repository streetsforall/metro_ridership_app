"""
Tests for check_transit_events.py.

Covers the pure date/ridership/shakeup logic with tiny in-memory fixtures — no
network and no real data files, so `known_route_ids`, `shakeups` and
`check_source` are all passed explicitly.
"""

from check_transit_events import (
    bus_route_ids,
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

SHAKEUPS = {"202004", "202112", "202210", "202306"}


def levels(findings, level):
    return [msg for lvl, msg in findings if lvl == level]


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


# --- bus route resolution -------------------------------------------------


def test_bus_route_ids_reads_short_names_and_brt_fallback():
    # 2 is a plain bus line; the G Line (901) has a blank short_name and must
    # fall back to the numeric prefix of route_id — the case that used to make
    # every bus/BRT id look unknown when only the rail feed was consulted.
    routes = [
        {"route_id": "2-13166", "route_short_name": "2"},
        {"route_id": "901-13166", "route_short_name": ""},
        {"route_id": "not-a-line", "route_short_name": ""},
    ]
    assert bus_route_ids(lambda _name: routes) == {2, 901}


def test_bus_line_event_is_not_warned_when_bus_feed_included():
    events = [
        {"id": "b", "date": "2022-10", "line_ids": [2], "category": "headway_change"},
    ]
    findings = check_events(events, RECORDS, known_route_ids={2, 807})
    assert not any(level == "WARN" and "line 2" in msg for level, msg in findings)
    # New categories land in the MANUAL bucket alongside extensions.
    assert any(level == "MANUAL" and "headway_change" in msg for level, msg in findings)


# --- shakeup cross-check --------------------------------------------------


def test_matching_shakeup_passes():
    events = [
        {
            "id": "k",
            "date": "2022-10",
            "line_ids": [807],
            "category": "opening",
            "shakeup": "202210",
        },
    ]
    findings = check_events(events, RECORDS, known_route_ids={807}, shakeups=SHAKEUPS)
    assert not [f for f in findings if f[0] == "FAIL"]


def test_shakeup_one_month_off_is_tolerated():
    # COVID: announced 2020-03, took effect on the 202004 pick.
    events = [
        {
            "id": "covid",
            "date": "2020-03",
            "line_ids": [],
            "category": "disruption",
            "shakeup": "202004",
        },
    ]
    findings = check_events(events, RECORDS, known_route_ids=set(), shakeups=SHAKEUPS)
    assert not [f for f in findings if f[0] == "FAIL"]


def test_shakeup_not_in_lookup_fails():
    events = [
        {
            "id": "k",
            "date": "2022-10",
            "line_ids": [807],
            "category": "opening",
            "shakeup": "202211",  # correct format, never a real pick
        },
    ]
    findings = check_events(events, RECORDS, known_route_ids={807}, shakeups=SHAKEUPS)
    assert any("not a pick period Metro ran" in msg for msg in levels(findings, "FAIL"))


def test_shakeup_far_from_event_date_fails():
    events = [
        {
            "id": "k",
            "date": "2022-10",
            "line_ids": [807],
            "category": "opening",
            "shakeup": "202112",  # a real pick, but 10 months away
        },
    ]
    findings = check_events(events, RECORDS, known_route_ids={807}, shakeups=SHAKEUPS)
    assert any("10 months apart" in msg for msg in levels(findings, "FAIL"))


def test_malformed_shakeup_fails():
    events = [
        {
            "id": "k",
            "date": "2022-10",
            "line_ids": [807],
            "category": "opening",
            "shakeup": "2022-10",
        },
    ]
    findings = check_events(events, RECORDS, known_route_ids={807}, shakeups=SHAKEUPS)
    assert any("not a YYYYMM id" in msg for msg in levels(findings, "FAIL"))


def test_shakeup_membership_skipped_without_lookup():
    events = [
        {
            "id": "k",
            "date": "2022-10",
            "line_ids": [807],
            "category": "opening",
            "shakeup": "202211",
        },
    ]
    findings = check_events(events, RECORDS, known_route_ids={807}, shakeups=None)
    assert not any("not a pick period" in msg for msg in levels(findings, "FAIL"))


# --- source checks --------------------------------------------------------


def base_event(**overrides):
    event = {"id": "s", "date": "2022-10", "line_ids": [807], "category": "opening"}
    event.update(overrides)
    return event


def test_missing_source_warns_but_does_not_fail():
    # Link/citation problems must never gate a data update.
    findings = check_events([base_event()], RECORDS, known_route_ids={807})
    assert any("no source URL cited" in msg for msg in levels(findings, "WARN"))
    assert not [f for f in findings if f[0] == "FAIL"]


def test_non_https_source_warns():
    events = [base_event(source="http://example.com/a")]
    findings = check_events(events, RECORDS, known_route_ids={807})
    assert any("not https" in msg for msg in levels(findings, "WARN"))


def test_reachable_source_is_silent():
    events = [base_event(source="https://example.com/a")]
    findings = check_events(
        events, RECORDS, known_route_ids={807}, check_source=lambda _url: True
    )
    assert not levels(findings, "WARN")


def test_dead_source_warns_but_does_not_fail():
    events = [base_event(source="https://example.com/gone")]
    findings = check_events(
        events, RECORDS, known_route_ids={807}, check_source=lambda _url: False
    )
    assert any("error status" in msg for msg in levels(findings, "WARN"))
    assert not [f for f in findings if f[0] == "FAIL"]


def test_source_check_transport_error_warns_but_does_not_fail():
    def boom(_url):
        raise OSError("no network")

    events = [base_event(source="https://example.com/a")]
    findings = check_events(
        events, RECORDS, known_route_ids={807}, check_source=boom
    )
    assert any("unreachable" in msg for msg in levels(findings, "WARN"))
    assert not [f for f in findings if f[0] == "FAIL"]


def test_source_check_skipped_when_not_injected():
    # Default (offline) path: cited sources produce no findings at all.
    events = [base_event(source="https://example.com/a")]
    findings = check_events(events, RECORDS, known_route_ids={807})
    assert not levels(findings, "WARN")
