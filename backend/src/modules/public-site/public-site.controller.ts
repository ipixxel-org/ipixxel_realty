import { Controller, Get, Post, Body, Param, Query, Header, Res } from '@nestjs/common';
import { PublicSiteService } from './public-site.service';
import type { Response } from 'express';

@Controller('public/site')
export class PublicSiteController {
  constructor(private readonly service: PublicSiteService) {}

  @Post('track')
  track(@Body() dto: { landingPageId: string; eventType?: string; metadata?: any }) {
    return this.service.recordPublicTrack(dto);
  }

  @Get('resolve/:domain')
  resolve(@Param('domain') domain: string) {
    return this.service.resolveByDomain(domain);
  }

  @Get('resolve-org/:host')
  resolveOrg(@Param('host') host: string) {
    return this.service.resolveByHost(host);
  }

  @Get('portal/:host')
  portal(@Param('host') host: string) {
    return this.service.resolvePortal(host);
  }

  @Get('projects/:landingPageId')
  projects(@Param('landingPageId') landingPageId: string) {
    return this.service.projectsForLandingPage(landingPageId);
  }

  @Get('domain/:domain/sitemap.xml')
  @Header('Content-Type', 'application/xml')
  async sitemap(@Param('domain') domain: string) {
    return this.service.sitemapForDomain(domain);
  }

  @Get('domain/:domain/robots.txt')
  @Header('Content-Type', 'text/plain')
  async robots(@Param('domain') domain: string) {
    return this.service.robotsForDomain(domain);
  }

  @Get('canonical/:landingPageId')
  canonical(@Param('landingPageId') id: string) {
    return this.service.canonicalForPage(id);
  }

  @Get('page/:slug')
  resolvePage(@Param('slug') slug: string, @Query('track') track?: string) {
    // SSR / metadata fetches pass track=0 so crawlers and server renders don't
    // inflate page-view analytics (the browser reports the real view).
    return this.service.resolveBySlug(slug, track !== '0');
  }

  @Get('page-by-id/:id')
  resolveById(@Param('id') id: string) {
    return this.service.resolveById(id);
  }

  // Every published landing page across the platform — feeds the platform
  // host's /sitemap.xml (one entry per public /:slug URL).
  @Get('published-pages')
  publishedPages() {
    return this.service.listPublishedPages();
  }
}
