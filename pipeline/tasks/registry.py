"""TASKS: every domain module's table, concatenated in DOMAINS order (T1207).

Importing this imports every pipeline/tasks/<domain>.py; they only define
dicts and functions, so nothing runs. run_pipeline.py reads TASKS from here.
"""
import importlib

from pipeline.tasks import DOMAINS

MODULES = tuple(importlib.import_module(f"pipeline.tasks.{d}") for d in DOMAINS)
TASKS = [t for m in MODULES for t in m.TASKS]
