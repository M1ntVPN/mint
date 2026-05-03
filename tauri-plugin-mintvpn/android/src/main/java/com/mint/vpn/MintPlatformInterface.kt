package com.mint.vpn

import android.os.Build
import io.nekohasekai.libbox.ConnectionOwner
import io.nekohasekai.libbox.InterfaceUpdateListener
import io.nekohasekai.libbox.LocalDNSTransport
import io.nekohasekai.libbox.NetworkInterfaceIterator
import io.nekohasekai.libbox.PlatformInterface
import io.nekohasekai.libbox.StringIterator
import io.nekohasekai.libbox.WIFIState

/**
 * Default no-op implementations for [PlatformInterface] that Mint doesn't
 * need on Android v1. The two interesting callbacks — [PlatformInterface.openTun]
 * and [PlatformInterface.autoDetectInterfaceControl] — are still abstract;
 * the [MintVpnService] provides them.
 *
 * `useProcFS` returns `true` on API < Q since `connectivity.getConnectionOwnerUid`
 * is unavailable there. Everything else returns sane "not available" values
 * so libbox falls back to its built-in resolvers. This mirrors what
 * sing-box-for-android does for the minimal/cellular-only path.
 */
interface MintPlatformDefaults : PlatformInterface {

    override fun usePlatformAutoDetectInterfaceControl(): Boolean = true

    override fun useProcFS(): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q

    override fun findConnectionOwner(
        ipProtocol: Int,
        sourceAddress: String,
        sourcePort: Int,
        destinationAddress: String,
        destinationPort: Int,
    ): ConnectionOwner {
        // Phase 2 doesn't ship per-app routing yet; tell libbox we don't know.
        // With useProcFS=false on API >= Q this method is also rarely invoked.
        throw UnsupportedOperationException("connection owner lookup not implemented")
    }

    override fun startDefaultInterfaceMonitor(listener: InterfaceUpdateListener) {
        // Letting libbox use its own default-network monitor (built-in
        // ConnectivityManager listener) means we don't need to shuttle
        // events from Kotlin to Go ourselves. Fine for v1.
    }

    override fun closeDefaultInterfaceMonitor(listener: InterfaceUpdateListener) {}

    override fun getInterfaces(): NetworkInterfaceIterator? = null

    override fun underNetworkExtension(): Boolean = false

    override fun includeAllNetworks(): Boolean = false

    override fun readWIFIState(): WIFIState? = null

    override fun systemCertificates(): StringIterator? = null

    override fun clearDNSCache() {}

    override fun sendNotification(notification: io.nekohasekai.libbox.Notification?) {}

    override fun localDNSTransport(): LocalDNSTransport? = null
}
