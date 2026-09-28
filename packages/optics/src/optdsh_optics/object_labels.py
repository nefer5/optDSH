"""Human labels from the same run's object evidence, never from a live lookup."""


def object_label(index, evidence=None, prefix='OBJ'):
    evidence = evidence or {}
    comment = evidence.get('comment', evidence.get('expectedComment'))
    # Missing historical evidence differs from a confirmed empty Comment.
    note = 'comment未记录' if comment is None else str(comment).strip() or '无 comment'
    return f'{prefix}{index if index is not None else "?"}[{note}]'
