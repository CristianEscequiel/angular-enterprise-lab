import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { LoadingService } from '../services/loading.service';
import { loadingInterceptor } from './loading.interceptor';

describe('loadingInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let loadingService: LoadingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([loadingInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    loadingService = TestBed.inject(LoadingService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('sets isLoading true while a request is in flight and false again after it resolves', () => {
    expect.assertions(3);
    expect(loadingService.isLoading()).toBe(false);

    http.get('/work-orders').subscribe();
    expect(loadingService.isLoading()).toBe(true);

    httpMock.expectOne('/work-orders').flush({});
    expect(loadingService.isLoading()).toBe(false);
  });

  it('resets isLoading to false after an HTTP error', () => {
    expect.assertions(2);

    http.get('/work-orders').subscribe({ error: () => undefined });
    expect(loadingService.isLoading()).toBe(true);

    httpMock.expectOne('/work-orders').flush('boom', { status: 500, statusText: 'Server Error' });
    expect(loadingService.isLoading()).toBe(false);
  });

  it('resets isLoading to false when a request is cancelled before it resolves', () => {
    expect.assertions(3);

    const subscription = http.get('/work-orders').subscribe();
    const request = httpMock.expectOne('/work-orders');
    expect(loadingService.isLoading()).toBe(true);

    subscription.unsubscribe();
    expect(loadingService.isLoading()).toBe(false);
    expect(request.cancelled).toBe(true);
  });
});
