
import { Component, signal, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from './api.service';
import { RouterOutlet } from '@angular/router';
import { Header } from './header/header';
import { ProductList } from './product-list/product-list';
import { Footer } from './footer/footer';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, Header, ProductList, Footer],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected readonly title = signal('tienda-moda');
  cartCount = signal(0);
  backendMessage = signal<string | null>(null);

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.getHello().subscribe({
      next: (res) => this.backendMessage.set(res.message),
      error: () => this.backendMessage.set('No se pudo conectar al backend')
    });
  }

  addToCart = () => {
    this.cartCount.update(count => count + 1);
  };
}
