
import { Component, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { ApiService, Product } from '../api.service';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, CurrencyPipe],
  templateUrl: './product-list.html',
  styleUrls: ['./product-list.scss'],
})
export class ProductList implements OnInit {
  @Output() addToCart = new EventEmitter<void>();
  products: Product[] = [];

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.getProducts().subscribe({
      next: (data) => this.products = data,
      error: () => this.products = []
    });
  }

  onAddToCart() {
    this.addToCart.emit();
  }
}
