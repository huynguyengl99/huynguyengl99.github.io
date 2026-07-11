---
title: "django-i18n-fields: Multilingual Model Fields for Django"
description: "Database-agnostic localized model fields built on Django's JSONField — with DRF serializers, strict type checking, and a clean admin UI. An alternative to django-localized-fields and django-modeltranslation."
pubDatetime: 2026-02-12T10:00:00+07:00
tags:
  - python
  - django
  - i18n
  - open-source
---

I ran multilingual content on django-localized-fields in production for a long time, but its hard PostgreSQL/HStore dependency and maintenance situation eventually pushed me to build a replacement: **[django-i18n-fields](https://github.com/huynguyengl99/django-i18n-fields)**. The API is intentionally similar, so migrating is straightforward.

## Table of contents

## What makes it different

- **Database agnostic** — uses Django's built-in `JSONField` instead of PostgreSQL's HStore, so it works with PostgreSQL, MySQL, SQLite, or anything Django supports. No database extensions needed.
- **DRF support** — ships with `LocalizedModelSerializer` and serializer fields that automatically return values in the active language.
- **Full type hints** — strict pyright and mypy checking; your IDE actually understands the localized fields.
- **Clean admin UI** — tab and dropdown modes for switching languages out of the box.
- **All the field types** — `CharField`, `TextField`, `IntegerField`, `FloatField`, `BooleanField`, `FileField`, `UniqueSlugField`, and even a `MartorField` for Markdown editing.
- **Modern versions** — Django 5.0+ and 6.0, Python 3.10+.

## Quick example

```python
# models.py
from i18n_fields import LocalizedCharField, LocalizedTextField

class Article(models.Model):
    title = LocalizedCharField(max_length=200, required=['en'])
    content = LocalizedTextField(blank=True)

# Usage
article = Article.objects.create(
    title={'en': 'Hello World', 'es': 'Hola Mundo'},
    content={'en': 'Content here', 'es': 'Contenido aqui'},
)

# Automatically uses the active language
print(article.title)  # "Hello World"

# Query by language
Article.objects.filter(title__en='Hello World')
Article.objects.order_by(L('title'))
```

And DRF just works:

```python
from i18n_fields.drf import LocalizedModelSerializer

class ArticleSerializer(LocalizedModelSerializer):
    class Meta:
        model = Article
        fields = ['id', 'title', 'content']

# Returns: {"id": 1, "title": "Hello World", "content": "Content here"}
```

## What's next

Built-in translation services — Google Translate or LLM-based auto-translation (Gemini/ChatGPT/Claude) for your records.

## Links

- GitHub: [huynguyengl99/django-i18n-fields](https://github.com/huynguyengl99/django-i18n-fields)
- Docs: [django-i18n-fields.readthedocs.io](https://django-i18n-fields.readthedocs.io/)
- PyPI: [django-i18n-fields](https://pypi.org/project/django-i18n-fields/)

I've been running this in production since migrating off django-localized-fields. Feedback and contributions welcome.
