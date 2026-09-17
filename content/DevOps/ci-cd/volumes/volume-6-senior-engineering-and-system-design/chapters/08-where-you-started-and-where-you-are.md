## Where you started, and where you are

Volume 0 asked: how does software get from a developer's laptop to a reliable production release?

You should now be able to say: it moves through a pipeline defined as code and versioned with the application; executed by runners whose trust boundaries you chose deliberately; producing one immutable artifact that is tested once and promoted unchanged through environments; deployed by a strategy matched to the failure cost; verified independently rather than assumed; recorded so that any release traces back to a commit and an approver; and reversible by a rollback path you have actually run and timed.

And when it breaks — which it will — you identify the layer before you dig.

That's the whole discipline. The GitLab keywords are just how you wrote it down this year.
