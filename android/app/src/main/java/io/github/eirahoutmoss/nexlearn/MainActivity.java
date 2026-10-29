package io.github.eirahoutmoss.nexlearn;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/** NexLearn Android kabuğu. Web uygulaması uygulamanın içinden yüklenir; ağdan kod indirilmez. */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NexNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
