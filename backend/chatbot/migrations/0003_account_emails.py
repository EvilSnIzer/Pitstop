from django.conf import settings
from django.db import migrations


def backfill(apps, schema_editor):
    app, name = settings.AUTH_USER_MODEL.split(".")
    users = apps.get_model(app, name)
    account = apps.get_model("chatbot", "AccountEmail")
    for user in users.objects.exclude(email="").iterator():
        email = user.email.strip().lower()
        if account.objects.filter(canonical=email).exclude(user_id=user.pk).exists():
            raise RuntimeError(
                "Duplicate case-insensitive email; resolve accounts before migrating"
            )
        account.objects.get_or_create(user_id=user.pk, defaults={"canonical": email})


class Migration(migrations.Migration):
    dependencies = [("chatbot", "0002_integrity_and_operations")]
    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
