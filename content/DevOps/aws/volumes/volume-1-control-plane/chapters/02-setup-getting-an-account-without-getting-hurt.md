## Setup: Getting an Account Without Getting Hurt

**Skip to the next section if you already have an account — but read the hardening steps anyway.** A genuinely large fraction of long-time AWS users have never done all of them.

### Step 1 — Create the account

Go to `https://aws.amazon.com/` and sign up. You will need:

- An email address not already tied to an AWS account
- A credit or debit card (AWS places a small temporary authorization charge, typically around one US dollar, and reverses it)
- A phone number for verification

Pick the **Basic Support** plan. It's free. The paid support tiers are excellent and you do not need one to learn.

### Step 2 — Understand what you just created

The email and password you signed up with are the **root user**. This is not "the admin account." It is something more dangerous: an identity that cannot be restricted. You can't attach a policy to it that limits it. Certain operations — closing the account, changing the support plan, restoring a badly broken IAM setup — can *only* be done by root.

The correct posture toward the root user is: lock it in a drawer and never use it again.

### Step 3 — Put MFA on root, right now

In the console, click your account name (top right) → **Security credentials** → **Multi-factor authentication (MFA)** → **Assign MFA device**.

Use an authenticator app on your phone, or a hardware key if you have one. Save the recovery codes somewhere that isn't your laptop.

**Why this matters more than anything else in this volume:** a compromised root user means a compromised account, full stop. There is no containment story. The attacker owns everything, including the ability to lock you out of your own billing.

### Step 4 — Set a budget alarm *before* you build anything

This is out of order compared to most tutorials, and deliberately so.

Console → search **Billing and Cost Management** → **Budgets** → **Create budget** → **Use a template** → **Monthly cost budget**. Set an amount you'd be annoyed but not ruined by. If you're learning, something like 10 USD is a reasonable trigger. Enter your email.

Then, in **Billing and Cost Management → Billing preferences**, turn on the alert for free tier usage.

The first two budgets are free. Do this now. Volume 9 explains the billing model properly; for today you just want a smoke detector.

### Step 5 — Stop using root: create an admin identity

You need a day-to-day identity that isn't root. There are two routes, and it's worth being honest about the trade-off.

**Route A — IAM Identity Center (what AWS recommends).** This is AWS's identity service for human users, with short-lived credentials and single sign-on. It's the right answer for any real organization, and it's what you'll see in production. It's also more setup than a solo learner needs on day one.

**Route B — a plain IAM user with MFA.** Simpler, adequate for a personal learning account, and the mechanics are more visible — which is useful precisely because you're here to see mechanics.

We'll use Route B for this guide, and Volume 2 will cover Identity Center properly once you understand what it's abstracting over. If you already know Identity Center, use it.

Console → **IAM** → **Users** → **Create user**:

- Username: something like `admin-you`
- Tick **Provide user access to the AWS Management Console**
- Set a custom password, untick the "must create a new password" box if you like
- **Permissions** → Attach policies directly → `AdministratorAccess`
- Create the user, then open it → **Security credentials** → assign an MFA device to *this* user too

Note the account-specific sign-in URL IAM gives you. Sign out of root. Sign back in as the new user. From here on, that's who you are.

*(`AdministratorAccess` is a blunt instrument and Volume 2 will make you slightly uncomfortable about it. For a sandbox account with a budget alarm, it's an acceptable starting point.)*

### Step 6 — Install the AWS CLI

**macOS (Homebrew):**
```bash
brew install awscli
```

**Linux (x86_64):**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

**Windows:** download and run the MSI installer from the AWS CLI documentation page, or use `winget install Amazon.AWSCLI`.

Verify:
```bash
aws --version
```

You want version 2.x. If you get a 1.x version from an old system package, uninstall it and use the installer above — v1 is in maintenance mode.

### Step 7 — Give the CLI credentials

Back in the console: **IAM → Users → your user → Security credentials → Create access key**. Choose **Command Line Interface (CLI)**, acknowledge the warning, and create it.

You get an **Access Key ID** and a **Secret Access Key**. The secret is shown exactly once. Then:

```bash
aws configure
```

Paste the key ID, paste the secret, set default region to `us-east-1`, and set output format to `json`.

Now the important part:

```bash
aws sts get-caller-identity
```

**You should get back JSON containing a `UserId`, your 12-digit `Account` number, and an `Arn` ending in your username.** That's the "who am I" call. It's the first command to run whenever anything AWS-related is confusing.

### A warning about that key you just made

Long-lived access keys are the single most leaked secret on the internet. They end up in Git repos, in Docker images, in screenshots, in Stack Overflow questions. There is an entire criminal economy built on scraping GitHub for them within seconds of a push.

Rules for this guide:

- Never commit `~/.aws/credentials` to anything
- Never paste a secret key into a chat, a ticket, or a code block
- If you ever suspect exposure: IAM → your user → deactivate and delete that key immediately, then create a new one

Volume 2 will show you why roles with temporary credentials are the real answer, and why the key you just created is a compromise we're making for teaching convenience.

---

