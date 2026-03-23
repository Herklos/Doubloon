package com.doubloon.checker

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicInteger

/**
 * Minimal JSON-RPC client using OkHttp.
 */
class RpcClient(
    private val client: OkHttpClient = OkHttpClient(),
) {
    private val idCounter = AtomicInteger(0)

    class RpcException(val code: Int, message: String) : Exception("RPC error $code: $message")

    suspend fun call(url: String, method: String, params: JSONArray): JSONObject =
        withContext(Dispatchers.IO) {
            val body = JSONObject().apply {
                put("jsonrpc", "2.0")
                put("id", idCounter.incrementAndGet())
                put("method", method)
                put("params", params)
            }

            val request = Request.Builder()
                .url(url)
                .post(body.toString().toRequestBody("application/json".toMediaType()))
                .build()

            val response = client.newCall(request).execute()
            val responseBody = response.body?.string()
                ?: throw RpcException(-1, "Empty response body")

            if (!response.isSuccessful) {
                throw RpcException(response.code, "HTTP ${response.code}")
            }

            val json = JSONObject(responseBody)

            if (json.has("error")) {
                val error = json.getJSONObject("error")
                throw RpcException(
                    error.optInt("code", -1),
                    error.optString("message", "Unknown error")
                )
            }

            json
        }

    suspend fun callForString(url: String, method: String, params: JSONArray): String {
        val json = call(url, method, params)
        return json.getString("result")
    }
}
