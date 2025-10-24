import { Routes } from '@angular/router';
import { Inicio } from './inicio/inicio';
import { ProductList } from './product-list/product-list';
import { Ofertas } from './ofertas/ofertas';
import { Contacto } from './contacto/contacto';

export const routes: Routes = [
	{ path: '', component: Inicio },
	{ path: 'productos', component: ProductList },
	{ path: 'ofertas', component: Ofertas },
	{ path: 'contacto', component: Contacto },
];
