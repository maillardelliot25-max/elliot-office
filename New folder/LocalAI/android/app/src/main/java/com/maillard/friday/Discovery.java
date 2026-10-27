package com.maillard.friday;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Finds Friday on the PC without knowing its address, on whatever local link the phone has: a USB cable
 * (USB tethering), the phone's own hotspot, or home Wi-Fi. No internet needed. The phone asks every
 * network it's on "FRIDAY?" and the PC answers "FRIDAY <port>". Call off the main thread.
 */
final class Discovery {
    private static final int PORT = 8765;
    private static final int WAIT_MS = 1500;

    private Discovery() {}

    /** "http://<pc>:<port>", or null if no PC answered. */
    static String find() {
        try (DatagramSocket s = new DatagramSocket()) {
            s.setBroadcast(true);
            s.setSoTimeout(WAIT_MS);
            byte[] ask = "FRIDAY?".getBytes(StandardCharsets.US_ASCII);
            for (InetAddress target : broadcastAddresses()) {
                try {
                    s.send(new DatagramPacket(ask, ask.length, target, PORT));
                } catch (Exception ignored) {   // one network refusing doesn't stop the others
                }
            }
            byte[] buf = new byte[64];
            long until = System.currentTimeMillis() + WAIT_MS;
            while (System.currentTimeMillis() < until) {
                DatagramPacket reply = new DatagramPacket(buf, buf.length);
                s.receive(reply);
                String text = new String(reply.getData(), 0, reply.getLength(), StandardCharsets.US_ASCII).trim();
                if (text.startsWith("FRIDAY ")) {
                    return "http://" + reply.getAddress().getHostAddress() + ":" + Integer.parseInt(text.substring(7).trim());
                }
            }
        } catch (Exception ignored) {   // timeout or no network at all
        }
        return null;
    }

    /** Is something listening at this "http://host:port" address? A quick check, about a second at most. */
    static boolean reachable(String server) {
        try {
            java.net.URL u = new java.net.URL(server);
            int port = u.getPort() > 0 ? u.getPort() : u.getDefaultPort();
            try (Socket sock = new Socket()) {
                sock.connect(new InetSocketAddress(u.getHost(), port), 1000);
                return true;
            }
        } catch (Exception e) {
            return false;
        }
    }

    private static List<InetAddress> broadcastAddresses() throws Exception {
        List<InetAddress> out = new ArrayList<>();
        for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
            if (!ni.isUp() || ni.isLoopback()) continue;
            for (InterfaceAddress ia : ni.getInterfaceAddresses()) {   // USB (rndis), hotspot (ap/swlan), Wi-Fi (wlan)
                if (ia.getAddress() instanceof Inet4Address && ia.getBroadcast() != null) out.add(ia.getBroadcast());
            }
        }
        out.add(InetAddress.getByName("255.255.255.255"));
        return out;
    }
}
