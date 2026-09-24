import factory
from django.contrib.auth.models import User

from .. import models


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User
        skip_postgeneration_save = True

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    username = factory.LazyAttribute(lambda o: o.email)

    @factory.post_generation
    def password(self, create, extracted, **kwargs):
        self.set_password(extracted or "correct-horse-battery-9")
        if create:
            self.save()


class ChatSessionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.ChatSession

    user = factory.SubFactory(UserFactory)
    status = models.ChatSession.in_progress
    slots = factory.LazyAttribute(lambda o: {})


class MessageFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = models.Message

    session = factory.SubFactory(ChatSessionFactory)
    role = models.Message.user
    content = "my car is making a noise"
