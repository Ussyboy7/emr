# DNS Resolution Fix for Server

The build is failing because the server cannot resolve DNS names. Here are solutions:

## Solution 1: Fix DNS on the Server (Recommended)

Run these commands on the server:

```bash
# Check current DNS
cat /etc/resolv.conf

# Test DNS resolution
nslookup pypi.org
ping -c 3 8.8.8.8

# If DNS is not working, add Google DNS
sudo nano /etc/resolv.conf
```

Add or update with:
```
nameserver 8.8.8.8
nameserver 8.8.4.4
```

Or make it permanent:
```bash
sudo nano /etc/systemd/resolved.conf
```

Uncomment and set:
```
[Resolve]
DNS=8.8.8.8 8.8.4.4
```

Then restart:
```bash
sudo systemctl restart systemd-resolved
```

## Solution 2: Configure Docker to Use Custom DNS

Create or edit `/etc/docker/daemon.json`:

```bash
sudo nano /etc/docker/daemon.json
```

Add:
```json
{
  "dns": ["8.8.8.8", "8.8.4.4"]
}
```

Restart Docker:
```bash
sudo systemctl restart docker
```

## Solution 3: Use DNS in docker-compose

We can add DNS configuration to docker-compose files.

## Quick Test

After fixing DNS, test:
```bash
# Test DNS
nslookup pypi.org

# Test connectivity
curl -I https://pypi.org

# If working, retry build
cd /srv/emr
docker-compose -f docker-compose.stag.yml build --no-cache
```

