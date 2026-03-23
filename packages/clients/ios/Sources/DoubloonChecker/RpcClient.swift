import Foundation

/// Minimal JSON-RPC client using URLSession.
actor RpcClient {
    private let session: URLSession
    private var idCounter: Int = 0

    init(session: URLSession = .shared) {
        self.session = session
    }

    struct RpcError: Error, CustomStringConvertible {
        let code: Int
        let message: String
        var description: String { "RPC error \(code): \(message)" }
    }

    func call<T: Decodable>(url: URL, method: String, params: Any) async throws -> T {
        idCounter += 1
        let body: [String: Any] = [
            "jsonrpc": "2.0",
            "id": idCounter,
            "method": method,
            "params": params,
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode >= 400 {
            throw RpcError(code: httpResponse.statusCode, message: "HTTP \(httpResponse.statusCode)")
        }

        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]

        if let error = json["error"] as? [String: Any] {
            throw RpcError(
                code: error["code"] as? Int ?? -1,
                message: error["message"] as? String ?? "Unknown RPC error"
            )
        }

        // For raw string results (eth_call), return directly
        if T.self == String.self, let result = json["result"] as? String {
            return result as! T
        }

        // For complex results, re-serialize the "result" and decode
        let resultData = try JSONSerialization.data(withJSONObject: json["result"] ?? NSNull())
        return try JSONDecoder().decode(T.self, from: resultData)
    }
}
