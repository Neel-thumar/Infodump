## The question this volume answers

In Volume 1 you ran this and saw something stark:

```bash
sudo unshare --net bash
ip addr
exit
```

One interface — `lo`, down. No routes. A network namespace is an island with no bridge to the mainland. That process couldn't reach the internet, couldn't reach your host, couldn't even reach itself.

And yet in Volume 3 you ran `docker run -d -p 8080:80 nginx`, typed `curl localhost:8080` on your host, and got a response from a process living in exactly that kind of island.

**So: what physically connects an isolated network namespace to the outside world, and what happens to a packet on its way in?**

The honest answer is that Docker performs about five distinct operations, all of them standard Linux networking, none of them Docker-specific. This volume does them by hand first, then finds Docker doing the same thing, then traces a real packet through the result.

One note before we start. Modern Debian uses the **nftables** backend, with `iptables` provided as a compatibility wrapper (`iptables-nft`). The `iptables` commands below work regardless, and Docker still speaks in `iptables` terms. Check which you have:

```bash
sudo iptables --version
```

If it says `nf_tables`, you're on the wrapper. Everything here still applies.

---

