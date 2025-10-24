export interface Product {
  id: number;
  name: string;
  price: number;
  image: string;
}
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  getHello(): Observable<{ message: string }> {
    return this.http.get<{ message: string }>('http://localhost:3000/api/hello');
  }

  getProducts(): Observable<Product[]> {
    return this.http.get<Product[]>('http://localhost:3000/api/products');
  }
}
