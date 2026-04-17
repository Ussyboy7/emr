# Restart Ubuntu Server

**To restart your Ubuntu server safely:**

## Option 1: Graceful Restart (Recommended)

```bash
# From SSH session - this will restart the server
sudo reboot

# Or use systemctl
sudo systemctl reboot
```

## Option 2: Immediate Restart (Use if system is unresponsive)

```bash
# Force restart (use only if needed)
sudo reboot -f
```

## Option 3: Via Console/VM Interface

If you have access to the VM console or physical console:
- **VMware/VirtualBox:** Use the restart option in the VM menu
- **Physical Server:** Press the power button briefly, or use IPMI if available

## After Restart

```bash
# SSH back in
ssh emrprod@172.16.0.32

# Check if EMR directory exists
ls -la ~/emr

# If EMR directory is missing, re-clone
cd ~
git clone https://github.com/Ussyboy7/emr.git

# Then proceed with EMR setup
cd emr
docker compose -f docker-compose.prod.yml up -d
```

## What Restart Will Fix

- **Filesystem issues** that might be causing file visibility problems
- **Permission cache** issues
- **Docker daemon** issues
- **Memory/cache** issues

## Alternative: Quick Diagnosis First

Before restarting, try:

```bash
# Check system status
uptime
free -h
df -h

# Check if Docker is running
sudo systemctl status docker

# Try to list EMR directory
ls -la ~/emr 2>/dev/null || echo "EMR directory issue"
```

**A server restart often resolves filesystem and permission issues!** 🔄

**After restart, the EMR clone should work properly!** 🚀

**Do you want to restart now, or try the quick diagnosis first?** 🔍

**Repository:** https://github.com/Ussyboy7/emr  
**Ready to restore after restart!** 🏥✨