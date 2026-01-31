export class ApiService {
  private static getToken(): string | null {
    return localStorage.getItem('authToken');
  }

  private static async request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };

    try {
      const response = await fetch(url, { ...options, headers });

      if (response.status === 401) {
        // Optional: Trigger a global event if we want to force logout from here
        // window.dispatchEvent(new Event('auth:unauthorized'));
      }

      const contentType = response.headers.get("content-type");
      let data: any;
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        throw new Error(data.error || data.message || `Request failed: ${response.status} ${response.statusText}`);
      }

      return data as T;
    } catch (error: any) {
      console.error(`API Request Failed: ${url}`, error);
      throw error;
    }
  }

  static async get<T>(url: string): Promise<T> {
    return this.request<T>(url, { method: 'GET' });
  }

  static async post<T>(url: string, body: any): Promise<T> {
    return this.request<T>(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  static async put<T>(url: string, body: any): Promise<T> {
    return this.request<T>(url, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  static async delete<T>(url: string): Promise<T> {
    return this.request<T>(url, { method: 'DELETE' });
  }
}
