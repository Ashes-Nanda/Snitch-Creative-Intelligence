# Insight status is three independent dimensions

The UI spec lists one insight status (hypothesis, supported within dataset, insufficient evidence, stale, dismissed), but those values answer three different questions: how strong the evidence is, whether a person dismissed it, and whether the data still reproduces it. One field would make combinations impossible to express (a dismissed insight can also be stale). Each dimension is tracked and shown separately: evidence level, review (open or dismissed), and freshness (current or stale).
