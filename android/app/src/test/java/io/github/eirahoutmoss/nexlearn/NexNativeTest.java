package io.github.eirahoutmoss.nexlearn;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class NexNativeTest {
    @Test
    public void namesAreSanitized() {
        assertEquals("passwd", NexNativePlugin.safeName("../../etc/passwd"));
        assertEquals("ödev.pdf", NexNativePlugin.safeName("C:\\x\\ödev.pdf"));
        assertEquals("hidden", NexNativePlugin.safeName(".hidden"));
        assertEquals("dosya", NexNativePlugin.safeName(""));
    }

    @Test
    public void apkNames() {
        assertTrue(NexNativePlugin.validApkName("NexLearn-0.2.0.apk"));
        assertFalse(NexNativePlugin.validApkName("../x.apk"));
        assertFalse(NexNativePlugin.validApkName("x.exe"));
    }

    @Test
    public void checksums() {
        String h = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        assertEquals(h, NexNativePlugin.expectedHash(h + "  NexLearn-0.2.0.apk\n", "NexLearn-0.2.0.apk"));
        assertNull(NexNativePlugin.expectedHash(h + "  other.apk\n", "NexLearn-0.2.0.apk"));
    }
}
