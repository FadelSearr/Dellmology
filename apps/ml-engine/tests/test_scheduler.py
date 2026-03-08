from dellmology.utils import model_retrain_scheduler as mrs


def test_scheduler_start_reschedule_stop():
    # Start scheduler with a harmless cron (daily at midnight)
    mrs.start_scheduler(lambda epochs=1: None, cron_expr="0 0 * * *", epochs=1)
    status = mrs.get_status()
    assert status['running'] is True
    assert status['cron'] == "0 0 * * *"

    # Reschedule to a different cron
    mrs.reschedule("5 0 * * *", epochs=2)
    status2 = mrs.get_status()
    assert status2['cron'] == "5 0 * * *"

    # Stop scheduler and ensure it's no longer running
    mrs.stop_scheduler()
    status3 = mrs.get_status()
    assert status3['running'] is False


def test_eval_scheduler_start_stop():
    # Start evaluation scheduler
    mrs.start_eval_scheduler(lambda: None, cron_expr="0 19 * * *")
    est = mrs.get_eval_status()
    assert est['running'] is True
    assert est['cron'] == "0 19 * * *"

    # Stop eval scheduler and verify
    mrs.stop_eval_scheduler()
    est2 = mrs.get_eval_status()
    assert est2['running'] is False
