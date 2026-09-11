## Build container networking by hand

No Docker. Just `iproute2` and `iptables`, which are already on your machine. By the end of this section you'll have a network namespace with internet access that you built yourself — and Docker's design will look inevitable rather than magical.

### Step 1: an island

```bash
sudo ip netns add manual-ns
sudo ip netns exec manual-ns ip addr
```

**Expect:** only `lo`, DOWN. Same island as before, but now it's a *named, persistent* namespace you can enter repeatedly — that's all `ip netns` adds over `unshare --net`.

```bash
sudo ip netns exec manual-ns ping -c1 8.8.8.8
```

**Expect:** "Network is unreachable." No interface, no route, nowhere to send anything.

### Step 2: the cable — a veth pair

A **veth pair** is a virtual Ethernet cable: two interfaces, permanently connected, where anything written into one comes out of the other. Critically, **the two ends can live in different network namespaces.** That property is the entire basis of container networking.

```bash
sudo ip link add veth-host type veth peer name veth-ns
ip link show veth-host
```

**Expect:** `veth-host@veth-ns` — the `@` names its peer. Both ends are currently in your host's namespace, which is useless. Move one end across:

```bash
sudo ip link set veth-ns netns manual-ns
ip link show veth-ns 2>&1 | tail -1
sudo ip netns exec manual-ns ip link show veth-ns
```

**Expect:** the host no longer has `veth-ns`; the namespace does. **You just moved a network interface between namespaces.** An interface belongs to exactly one network namespace at a time, and moving it is a single command. (Note: moving an interface resets its configuration, which is why you address it after the move, not before.)

### Step 3: address both ends and bring them up

```bash
sudo ip addr add 10.99.0.1/24 dev veth-host
sudo ip link set veth-host up

sudo ip netns exec manual-ns ip addr add 10.99.0.2/24 dev veth-ns
sudo ip netns exec manual-ns ip link set veth-ns up
sudo ip netns exec manual-ns ip link set lo up

sudo ip netns exec manual-ns ping -c2 10.99.0.1
```

**Expect:** replies. The namespace can now reach your host over the virtual cable.

### Step 4: a default route

```bash
sudo ip netns exec manual-ns ip route
sudo ip netns exec manual-ns ip route add default via 10.99.0.1
sudo ip netns exec manual-ns ping -c1 8.8.8.8
```

**Expect:** the ping now *leaves* (no "unreachable") but still gets no reply. Progress — the packet reaches your host and then dies there, for two reasons.

### Step 5: forwarding and NAT

Reason one: your host is not a router, so it drops packets that aren't for it.

```bash
cat /proc/sys/net/ipv4/ip_forward
sudo sysctl -w net.ipv4.ip_forward=1
```

Reason two, and the more interesting one: the packet has source address `10.99.0.2`, which is meaningless on the internet. It would go out, and the reply would have nowhere to come back to. The fix is **source NAT** — rewrite the source address to your host's, remember the mapping, and rewrite replies back:

```bash
IFACE=$(ip route show default | awk '{print $5; exit}')
echo "uplink interface: $IFACE"
sudo iptables -t nat -A POSTROUTING -s 10.99.0.0/24 -o $IFACE -j MASQUERADE

sudo ip netns exec manual-ns ping -c2 8.8.8.8
```

**Expect:** replies from the internet, from inside a namespace that started with nothing.

`MASQUERADE` is source NAT that uses whatever address the outgoing interface currently has. That's exactly what Docker does for outbound container traffic, and you'll find a nearly identical rule in your NAT table in a moment.

### Step 6: publish a port inbound

Outbound works. Inbound — reaching a server *inside* the namespace from outside — needs **destination NAT**.

```bash
sudo ip netns exec manual-ns sh -c 'nc -l -p 8000 -k -e /bin/echo "hello from the namespace" &' 2>/dev/null || \
  echo "starting a listener instead:"
sudo ip netns exec manual-ns python3 -m http.server 8000 &
sleep 2
curl -s --max-time 2 http://10.99.0.2:8000 | head -3
```

That works from your host because you have a route to `10.99.0.2`. But nobody else does — that address doesn't exist outside your machine. So: DNAT any packet arriving at host port 9000 to `10.99.0.2:8000`.

```bash
sudo iptables -t nat -A PREROUTING -p tcp --dport 9000 -j DNAT --to-destination 10.99.0.2:8000
sudo iptables -t nat -A OUTPUT -p tcp -d 127.0.0.1 --dport 9000 -j DNAT --to-destination 10.99.0.2:8000
curl -s --max-time 2 http://127.0.0.1:9000 | head -3
```

**Expect:** the listing served from inside the namespace, reached via a host port.

You now have the complete mechanism. **`docker run -p 9000:8000` is that DNAT rule.** The `OUTPUT` rule is needed separately because locally-generated traffic doesn't traverse `PREROUTING` — a detail that will matter when we discuss why the firewall gets bypassed.

### Step 7: why a bridge

One namespace needed one veth pair. Ten namespaces would need ten veth pairs, ten subnets, ten sets of routes — and they still couldn't talk to *each other*.

A **Linux bridge** is a virtual switch. Put one end of every veth pair into it, give the bridge an IP, and every namespace lands on a shared L2 segment with one gateway. That's what `docker0` is.

```bash
sudo ip link show type bridge
```

**Cleanup for this section:**

```bash
sudo pkill -f "http.server 8000"
IFACE=$(ip route show default | awk '{print $5; exit}')
sudo iptables -t nat -D POSTROUTING -s 10.99.0.0/24 -o $IFACE -j MASQUERADE
sudo iptables -t nat -D PREROUTING -p tcp --dport 9000 -j DNAT --to-destination 10.99.0.2:8000
sudo iptables -t nat -D OUTPUT -p tcp -d 127.0.0.1 --dport 9000 -j DNAT --to-destination 10.99.0.2:8000
sudo ip netns del manual-ns
sudo ip link del veth-host 2>/dev/null
```

> **Flagged:** this section enables IP forwarding and adds NAT rules to your host. The cleanup removes the rules; `ip_forward` was almost certainly already `1` if Docker is running, and Docker needs it. Nothing here opens a port to the internet unless your host is directly internet-facing — if it is, run the `curl` steps but skip leaving the DNAT rule in place.

---

