import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Badge, BadgeVariant } from './badge';

describe('Badge', () => {
  let component: Badge;
  let fixture: ComponentFixture<Badge>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Badge],
    }).compileComponents();

    fixture = TestBed.createComponent(Badge);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it.each<[BadgeVariant, string]>([
    ['pending', 'badge--warning'],
    ['warning', 'badge--warning'],
    ['in-progress', 'badge--info'],
    ['info', 'badge--info'],
    ['completed', 'badge--success'],
    ['success', 'badge--success'],
    ['cancelled', 'badge--error'],
    ['error', 'badge--error'],
    ['neutral', 'badge--neutral'],
  ])('renders the %s variant with the %s class', async (variant, expectedClass) => {
    fixture.componentRef.setInput('variant', variant);
    await fixture.whenStable();

    const badge: HTMLElement = fixture.nativeElement.querySelector('.badge');
    expect(badge.classList.contains(expectedClass)).toBe(true);
    expect(badge.classList.contains('badge--neutral')).toBe(expectedClass === 'badge--neutral');
  });
});
