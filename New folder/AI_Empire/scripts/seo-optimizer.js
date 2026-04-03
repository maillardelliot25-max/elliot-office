/**
 * SEO Optimizer (Portfolio)
 * Optimizes project pages for search engines
 * Generates meta tags, sitemaps, structured data
 * Improves visibility for job/client acquisition
 */

const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');

class SEOOptimizer {
  constructor() {
    this.name = 'SEO Optimizer';
    this.projectsDir = path.join(__dirname, '../../projects');
    this.metrics = {};
  }

  /**
   * Generate meta tags for a project
   */
  generateMetaTags(project) {
    const metaTags = {
      title: `${project.name} - Professional ${project.type} Portfolio`,
      description: project.description || `${project.name}: ${project.type} project by maillardelliot25-max`,
      keywords: [project.type, 'portfolio', 'web development', 'full-stack'].join(', '),
      ogTitle: project.name,
      ogDescription: project.description,
      ogImage: `https://portfolio.example.com/${project.id}/thumbnail.jpg`,
      ogUrl: `https://portfolio.example.com/${project.id}/`,
    };

    return metaTags;
  }

  /**
   * Generate structured data (Schema.org)
   */
  generateStructuredData(project) {
    return {
      '@context': 'https://schema.org',
      '@type': 'Project',
      name: project.name,
      description: project.description,
      url: `https://portfolio.example.com/${project.id}/`,
      image: `https://portfolio.example.com/${project.id}/thumbnail.jpg`,
      creator: {
        '@type': 'Person',
        name: 'maillardelliot25-max',
        url: 'https://portfolio.example.com',
      },
      dateCreated: project.dateCreated || '2026-04-03',
      keywords: project.type,
    };
  }

  /**
   * Audit page for SEO issues
   */
  auditPage(htmlContent) {
    const issues = [];

    // Check for missing meta description
    if (!htmlContent.includes('<meta name="description"')) {
      issues.push({
        severity: 'high',
        issue: 'Missing meta description',
        impact: 'Reduced click-through rate from search results',
        fix: 'Add meta description (155 chars)',
      });
    }

    // Check for missing Open Graph tags
    if (!htmlContent.includes('og:title')) {
      issues.push({
        severity: 'medium',
        issue: 'Missing Open Graph tags',
        impact: 'Poor social media sharing preview',
        fix: 'Add og:title, og:description, og:image',
      });
    }

    // Check for missing heading hierarchy
    if (!htmlContent.includes('<h1')) {
      issues.push({
        severity: 'high',
        issue: 'Missing H1 tag',
        impact: 'Poor SEO ranking for main keywords',
        fix: 'Add unique H1 tag with primary keyword',
      });
    }

    // Check for image alt text
    const imgTags = htmlContent.match(/<img[^>]*>/g) || [];
    const noAltImages = imgTags.filter(img => !img.includes('alt=')).length;
    if (noAltImages > 0) {
      issues.push({
        severity: 'medium',
        issue: `${noAltImages} images without alt text`,
        impact: 'Reduced accessibility and SEO',
        fix: 'Add descriptive alt text to all images',
      });
    }

    // Check for mobile viewport
    if (!htmlContent.includes('viewport')) {
      issues.push({
        severity: 'high',
        issue: 'Missing mobile viewport meta tag',
        impact: 'Poor mobile rendering and SEO ranking',
        fix: 'Add: <meta name="viewport" content="width=device-width, initial-scale=1.0">',
      });
    }

    return issues;
  }

  /**
   * Generate sitemap.xml
   */
  generateSitemap(projects) {
    let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
    sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Add home
    sitemap += '  <url>\n';
    sitemap += '    <loc>https://portfolio.example.com</loc>\n';
    sitemap += '    <lastmod>' + new Date().toISOString().split('T')[0] + '</lastmod>\n';
    sitemap += '    <priority>1.0</priority>\n';
    sitemap += '  </url>\n';

    // Add each project
    projects.forEach(project => {
      sitemap += '  <url>\n';
      sitemap += `    <loc>https://portfolio.example.com/${project.id}/</loc>\n`;
      sitemap += `    <lastmod>${project.dateUpdated || new Date().toISOString().split('T')[0]}</lastmod>\n`;
      sitemap += '    <priority>0.8</priority>\n';
      sitemap += '  </url>\n';
    });

    sitemap += '</urlset>';
    return sitemap;
  }

  /**
   * Generate robots.txt
   */
  generateRobotsTxt() {
    return `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /private/

Sitemap: https://portfolio.example.com/sitemap.xml`;
  }

  /**
   * Calculate SEO score (0-100)
   */
  calculateSEOScore(issues) {
    let score = 100;

    issues.forEach(issue => {
      if (issue.severity === 'high') score -= 15;
      else if (issue.severity === 'medium') score -= 8;
      else if (issue.severity === 'low') score -= 3;
    });

    return Math.max(0, score);
  }

  /**
   * Execute full SEO optimization
   */
  async execute() {
    logger.info('SEO Optimizer cycle started');

    try {
      // Example projects
      const projects = [
        {
          id: '01-maillard-ai',
          name: 'Maillard AI',
          type: 'Dashboard',
          description: 'Autonomous revenue tracking system for multiple income streams',
          dateCreated: '2026-04-03',
        },
        {
          id: '08-portfolio',
          name: 'Portfolio Dashboard',
          type: 'Portfolio',
          description: 'Full-stack developer portfolio showcasing 10 production projects',
        },
      ];

      // Generate and log SEO elements
      projects.forEach(project => {
        const metaTags = this.generateMetaTags(project);
        const structuredData = this.generateStructuredData(project);

        logger.info(`SEO generated for ${project.name}`, {
          metaTags: metaTags.title,
          structuredData: structuredData['@type'],
        });

        this.metrics[project.id] = {
          metaTags,
          structuredData,
        };
      });

      // Generate sitemap and robots.txt
      const sitemap = this.generateSitemap(projects);
      const robotsTxt = this.generateRobotsTxt();

      logger.info('Sitemap and robots.txt generated', {
        urls: projects.length + 1,
      });

      logger.info('SEO Optimizer cycle complete');
    } catch (error) {
      logger.error('SEO optimization failed', { error: error.message });
    }
  }
}

module.exports = SEOOptimizer;

// Standalone execution
if (require.main === module) {
  const optimizer = new SEOOptimizer();
  optimizer.execute();
}
