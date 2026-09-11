## Now find Docker doing exactly this

### The bridge

```bash
ip addr show docker0
ip -d link show docker0 | head -3
```

**Expect:** a bridge named `docker0`, typically `172.17.0.1/16`. That's the gateway address every container on the default bridge uses — your Step 3 host end, generalized.

### The veth pairs

```bash
docker run -d --name net1 --rm alpine sleep 300
docker run -d --name net2 --rm alpine sleep 300

ip link show type veth
bridge link show
```

**Expect:** two new interfaces with names like `vethXXXXXX@ifN`, both enslaved to `docker0`. Each is the host end of a pair whose other end lives in a container.

Match a specific one to its container:

```bash
PID=$(docker inspect -f '{{.State.Pid}}' net1)
sudo nsenter -t $PID -n ip addr show eth0
sudo nsenter -t $PID -n ip link show eth0 | head -1
```

**Expect:** `eth0` inside the container, with an address like `172.17.0.2/16`, and a line ending in `@if<N>` where `<N>` is the host-side interface index. Look it up:

```bash
IFINDEX=$(sudo nsenter -t $PID -n cat /sys/class/net/eth0/iflink)
echo "peer host ifindex: $IFINDEX"
ip link | grep "^$IFINDEX:"
```

**Expect:** the host-side `veth` that pairs with this container's `eth0`. You just traced a virtual cable across a namespace boundary.

**The container's `eth0` is not special.** It's the far end of a veth pair, renamed. Containers see `eth0` for the same reason your laptop does: convention.

### Routes and gateway

```bash
sudo nsenter -t $PID -n ip route
sudo nsenter -t $PID -n cat /etc/resolv.conf
```

**Expect:** a default route via `172.17.0.1` — the `docker0` address — exactly like your Step 4.

### Container-to-container on the same bridge

```bash
IP2=$(docker inspect -f '{{.NetworkSettings.IPAddress}}' net2)
docker exec net1 ping -c2 $IP2
docker exec net1 ping -c2 net2 2>&1 | tail -2
```

**Expect:** the IP works; the **name does not** ("bad address"). This is the default-bridge limitation from Volume 3, and now you know it's a DNS question, not a connectivity one — the packets would flow fine if the name resolved.

```bash
docker stop net1 net2
```

---

