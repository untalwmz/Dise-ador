package expo.modules.bluetoothgnss

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.UUID

// Conecta con receptores GNSS Bluetooth clásicos (perfil serie SPP) que envían
// sentencias NMEA: Garmin GLO, Bad Elf, Trimble R1/R2, Emlid Reach, ArduSimple,
// receptores RTK chinos, etc. El receptor debe estar emparejado en Android.
@SuppressLint("MissingPermission")
class BluetoothGnssModule : Module() {
  private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

  @Volatile private var socket: BluetoothSocket? = null
  @Volatile private var readThread: Thread? = null
  @Volatile private var userClosed = false

  // Solo reenviamos a JS las sentencias que usamos, para no saturar el puente.
  private val wanted = setOf("GGA", "GST", "RMC")

  private fun adapter(): BluetoothAdapter? {
    val ctx = appContext.reactContext ?: return null
    val manager = ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    return manager?.adapter
  }

  override fun definition() = ModuleDefinition {
    Name("BluetoothGnss")

    Events("onNmea", "onStatus")

    Function("isSupported") { -> adapter() != null }

    Function("isEnabled") { -> adapter()?.isEnabled == true }

    Function("isConnected") { -> socket?.isConnected == true }

    AsyncFunction("getBondedDevices") { promise: Promise ->
      try {
        val a = adapter()
        if (a == null) {
          promise.resolve(emptyList<Map<String, Any?>>())
          return@AsyncFunction
        }
        val list = a.bondedDevices.map { d ->
          mapOf(
            "name" to (d.name ?: d.address),
            "address" to d.address,
            "type" to d.type
          )
        }
        promise.resolve(list)
      } catch (e: SecurityException) {
        promise.reject("E_PERMISSION", "Falta el permiso de Bluetooth (dispositivos cercanos)", e)
      } catch (e: Exception) {
        promise.reject("E_BLUETOOTH", e.message ?: "Error de Bluetooth", e)
      }
    }

    AsyncFunction("connect") { address: String, promise: Promise ->
      val a = adapter()
      if (a == null) {
        promise.reject("E_NO_BLUETOOTH", "Este dispositivo no tiene Bluetooth", null)
        return@AsyncFunction
      }
      if (!a.isEnabled) {
        promise.reject("E_DISABLED", "El Bluetooth está apagado", null)
        return@AsyncFunction
      }
      closeSocket()
      userClosed = false
      Thread {
        try {
          val device = a.getRemoteDevice(address)
          try {
            a.cancelDiscovery()
          } catch (_: Exception) {
          }
          val s = openSocket(device)
          socket = s
          sendEvent("onStatus", mapOf("state" to "connected", "address" to address))
          promise.resolve(mapOf("name" to (device.name ?: address), "address" to address))
          startReading(s, address)
        } catch (e: SecurityException) {
          promise.reject("E_PERMISSION", "Falta el permiso de Bluetooth (dispositivos cercanos)", e)
        } catch (e: Exception) {
          promise.reject("E_CONNECT", "No se pudo conectar: ${e.message}", e)
        }
      }.start()
    }

    AsyncFunction("disconnect") { ->
      userClosed = true
      closeSocket()
    }

    OnDestroy {
      userClosed = true
      closeSocket()
    }
  }

  // Intenta varias formas de abrir el canal serie; algunos receptores solo
  // aceptan conexiones "inseguras" o en el canal RFCOMM 1.
  private fun openSocket(device: BluetoothDevice): BluetoothSocket {
    var lastError: Exception? = null
    val attempts: List<() -> BluetoothSocket> = listOf(
      { device.createRfcommSocketToServiceRecord(sppUuid) },
      { device.createInsecureRfcommSocketToServiceRecord(sppUuid) },
      {
        val m = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
        m.invoke(device, 1) as BluetoothSocket
      }
    )
    for (create in attempts) {
      var s: BluetoothSocket? = null
      try {
        s = create()
        s.connect()
        return s
      } catch (e: Exception) {
        lastError = e
        try {
          s?.close()
        } catch (_: Exception) {
        }
      }
    }
    throw lastError ?: IllegalStateException("No se pudo abrir el canal Bluetooth")
  }

  private fun startReading(s: BluetoothSocket, address: String) {
    val t = Thread {
      try {
        val reader = BufferedReader(InputStreamReader(s.inputStream, Charsets.US_ASCII))
        while (!Thread.currentThread().isInterrupted) {
          val line = reader.readLine() ?: break
          val trimmed = line.trim()
          if (trimmed.length < 7 || trimmed[0] != '$') continue
          val type = trimmed.substring(3, 6)
          if (type in wanted) {
            sendEvent("onNmea", mapOf("line" to trimmed, "t" to System.currentTimeMillis()))
          }
        }
        if (!userClosed) {
          sendEvent("onStatus", mapOf("state" to "disconnected", "address" to address, "message" to "El receptor cerró la conexión"))
        }
      } catch (e: Exception) {
        if (!userClosed) {
          sendEvent("onStatus", mapOf("state" to "disconnected", "address" to address, "message" to (e.message ?: "Conexión perdida")))
        }
      } finally {
        if (socket === s) socket = null
        try {
          s.close()
        } catch (_: Exception) {
        }
      }
    }
    t.isDaemon = true
    t.name = "BluetoothGnssReader"
    readThread = t
    t.start()
  }

  private fun closeSocket() {
    readThread?.interrupt()
    readThread = null
    try {
      socket?.close()
    } catch (_: Exception) {
    }
    socket = null
  }
}
