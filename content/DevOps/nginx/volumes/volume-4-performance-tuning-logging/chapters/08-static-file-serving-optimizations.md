## Static File Serving Optimizations

### `sendfile`

```nginx
http {
    sendfile on;
}
```

Without `sendfile`, nginx reads a file from disk into a user-space buffer, then writes it to the network socket. This involves copying data between kernel space and user space twice.

With `sendfile on`, the kernel transfers data directly from the file to the network socket without involving user-space buffers. This is significantly more efficient for serving static files.

**Always enable this.** There is no downside for normal use.

### `tcp_nopush`

```nginx
http {
    sendfile  on;
    tcp_nopush on;
}
```

Works with `sendfile`. Tells the kernel to wait until a full packet of data is ready before sending it, rather than sending partial packets. This reduces the number of network packets for large files.

Only has an effect when `sendfile` is on. Enable both together.

### `tcp_nodelay`

```nginx
http {
    tcp_nodelay on;
}
```

This is on by default. It disables Nagle's algorithm, which buffers small data writes to combine them into larger packets. For interactive traffic (API responses, web pages), you want data sent immediately, not delayed.

`tcp_nopush` and `tcp_nodelay` might seem contradictory (one delays sending, the other forces immediate sending), but nginx uses them at different phases: `tcp_nopush` while sending the body with `sendfile`, `tcp_nodelay` for the final packet and for non-sendfile data. They work well together.

### Summary of Static Optimizations

```nginx
http {
    sendfile    on;
    tcp_nopush  on;
    tcp_nodelay on;
}
```

These three lines are standard in every production config. They cost nothing and improve static file delivery.

---

