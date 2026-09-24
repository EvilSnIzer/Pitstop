from django.contrib import admin

from . import models


@admin.register(models.ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("user__email",)


@admin.register(models.Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "status", "scheduled_at", "created_at")
    list_filter = ("status",)
    date_hierarchy = "scheduled_at"


admin.site.register(models.Message)
admin.site.register(models.Diagnosis)
admin.site.register(models.MediaFile)
