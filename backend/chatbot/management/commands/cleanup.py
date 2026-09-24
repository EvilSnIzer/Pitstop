from datetime import timedelta
from functools import partial

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from chatbot.models import DailyAIUsage, MediaFile, Operation


class Command(BaseCommand):
    help = "Expire 30-day idempotency records, 90-day AI counters and day-old unattached uploads."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply", action="store_true", help="Delete candidates; default is dry-run."
        )

    def handle(self, *args, **options):
        now = timezone.now()
        operations = Operation.objects.filter(created_at__lt=now - timedelta(days=30))
        usage = DailyAIUsage.objects.filter(day__lt=(now - timedelta(days=90)).date())
        media = MediaFile.objects.filter(
            created_at__lt=now - timedelta(days=1), messages__isnull=True
        )
        self.stdout.write(
            f"operations={operations.count()} counters={usage.count()} "
            f"orphan_uploads={media.count()}"
        )
        if not options["apply"]:
            return
        operations.delete()
        usage.delete()
        for pk in media.values_list("pk", flat=True).iterator():
            with transaction.atomic():
                row = MediaFile.objects.select_for_update().filter(pk=pk).first()
                if not row or row.messages.exists():
                    continue
                if row.analysis_until and row.analysis_until > timezone.now():
                    continue
                storage, name = row.file.storage, row.file.name
                row.delete()
                # A rolled-back transaction must never remove a still-referenced file.
                self.stdout.write(f"Removing orphan: {name}")
                transaction.on_commit(partial(storage.delete, name))
        self.stdout.write(
            "Cleanup applied. Run flushexpiredtokens separately for expired JWT records."
        )
