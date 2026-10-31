# Little Halloween Poll

A mobile friendly Halloween poll hosted as a static site on GitHub Pages. Supabase stores votes so everyone sees the same results. Admin result access and deletion happen through a Supabase Edge Function; the service role key and admin password never go in the website files.

## What it does

- Username entry, with an Admin password field shown only for the exact username `Admin`.
- Three free text polls: Best Costume (Adults), Best Costume (Kids), and Spookiest Cookie.
- A second confirmation step before an answer is saved.
- One answer per username per poll. Returning with the same username lets someone update it, including on another device.
- Admin results sorted alphabetically by answer, with single answer deletion and a clear all button for each poll.
- Responsive layout, Halloween colors, emoji decorations, and a pumpkin favicon.

## Publish it

### 1. Create a Supabase project

Create a project at [Supabase](https://supabase.com/dashboard). Keep the project dashboard private.

### 2. Create the votes table

In the Supabase dashboard, open **SQL Editor → New query**, paste the contents of [`supabase/migrations/20261031000000_create_poll_votes.sql`](supabase/migrations/20261031000000_create_poll_votes.sql), and run it. This creates the vote table with direct browser access disabled.

### 3. Deploy the Edge Function

Install the [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started), then open a terminal in this repository and run:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy poll-api --no-verify-jwt
```

Find the project ref in your Supabase project's URL or **Project Settings → General**. The `--no-verify-jwt` flag is intentional: this endpoint accepts public votes, then checks the admin password itself before returning or changing results.

The function defaults to the requested admin password, `Password`. To choose a different password, set the Edge Function secret **before** deploying (recommended):

```sh
supabase secrets set ADMIN_PASSWORD='your-long-private-password' --project-ref YOUR_PROJECT_REF
```

The function uses Supabase's injected `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the server. Do not put either service-role credentials or `ADMIN_PASSWORD` in `app-config.js` or GitHub.

### 4. Configure the public site

Open `app-config.js` and fill in the **Project URL** and the project's **publishable key** (the legacy `anon` key also works) from **Project Settings → API Keys**:

```js
window.POLL_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
  supabaseAnonKey: "YOUR_PUBLISHABLE_KEY",
};
```

The publishable/anon key is meant to be used in a public website. The service-role key is secret and must never be used here. Commit the configured `app-config.js`; it only contains public connection details.

### 5. Push the repository to GitHub

Create an empty GitHub repository, then from this folder run (replace the URL with your repository URL):

```sh
git add .
git commit -m "Create Halloween poll app"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_NAME/YOUR_REPOSITORY.git
git push -u origin main
```

In the repository, open **Settings → Pages**, choose **GitHub Actions** under **Build and deployment → Source**, and save. The included workflow deploys the site after each push to `main`. Wait for the workflow to finish; GitHub will show the public URL in **Settings → Pages**. For a project named `halloween-poll`, the URL will look like `https://YOUR_GITHUB_NAME.github.io/halloween-poll/`.

## Use it

Open the GitHub Pages URL on a phone or computer. Enter any username to vote. Enter the exact username `Admin` to reveal the password field; enter the configured admin password to manage results. `Admin` is reserved and cannot submit votes.

## Notes

- Username-only voting is intentionally lightweight for a casual event. There is no personal account password; anyone who knows a participant's username can replace that participant's answer.
- Because usernames have no password, someone who knows a participant's username can also look up that username's saved answers to prefill them on another device.
- The default admin password `Password` is easy to guess. Set a private `ADMIN_PASSWORD` secret in Supabase before using the site publicly.
- Votes are keyed by poll and username, so a username can submit one answer per poll and edit it later. The database keeps the latest answer and update time.
- GitHub Pages hosts only the website. Supabase is needed for shared, persistent votes and private admin operations.
