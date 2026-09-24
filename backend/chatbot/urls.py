from django.urls import path

from . import views

urlpatterns = [
    path("auth/register/", views.RegisterView.as_view()),
    path("auth/token/", views.LoginView.as_view()),
    path("auth/token/refresh/", views.RefreshView.as_view()),
    path("auth/me/", views.MeView.as_view()),
    path("auth/logout/", views.LogoutView.as_view()),
    path("media/<int:media_id>/", views.MediaView.as_view()),
    path("sessions/", views.SessionView.as_view()),
    path("sessions/<int:session_id>/history/", views.HistoryView.as_view()),
    path("chat/", views.ChatView.as_view()),
    path("upload/authorize/", views.UploadTicketView.as_view()),
    path("upload/", views.UploadView.as_view()),
    path("diagnosis/", views.DiagnosisView.as_view()),
    path("booking/", views.BookingCreateView.as_view()),
    path("booking/<int:booking_id>/", views.BookingDetailView.as_view()),
]
