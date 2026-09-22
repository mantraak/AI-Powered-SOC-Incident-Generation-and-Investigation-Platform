# Automatic server deployment

The `Deploy to production` GitHub Actions workflow tests the backend, builds the
frontend, validates the Compose file, and deploys every push to `main` over SSH.
It can also be started manually from the Actions tab.

## Server prerequisites

Use a Linux server with Docker Engine, the Docker Compose plugin, `rsync`, and an
SSH user allowed to run Docker. Create the deployment directory and put a
production `.env` file in it; the workflow preserves that file during sync.

At minimum, set a strong `SECRET_KEY` and replace all credentials whose Compose
defaults contain `ChangeMe` or development passwords. The server-side `.env`,
tool secrets, and generated Wazuh certificates are deliberately excluded from
synchronization.

## GitHub configuration

Create a GitHub Actions environment named `production`, then configure:

| Type | Name | Value |
|---|---|---|
| Variable | `DEPLOY_PATH` | Absolute server directory, for example `/opt/romulus` |
| Secret | `SERVER_HOST` | Server hostname or IP address |
| Secret | `SERVER_USER` | SSH deployment user |
| Secret | `SERVER_PORT` | SSH port (optional; defaults to `22`) |
| Secret | `SERVER_SSH_KEY` | Private key for the deployment user |
| Secret | `SERVER_KNOWN_HOSTS` | Trusted `known_hosts` line for the server |

Generate the last value from a trusted machine with `ssh-keyscan -H HOST`, then
verify its fingerprint before saving it. Add the matching public key to the
deployment user's `~/.ssh/authorized_keys` file on the server.

Once configured, merge or push to `main`, or choose **Run workflow** under
**Actions > Deploy to production**.
