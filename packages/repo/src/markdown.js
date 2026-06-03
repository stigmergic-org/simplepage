import { Renderer, marked } from 'marked'

import { mediaType } from '@simplepg/common'

const FRONTMATTER_REGEX = /^---\s*\n[\s\S]*?\n---\s*\n?/

export const isWeb3Uri = (href = '') => (
  typeof href === 'string' && href.toLowerCase().startsWith('web3://')
)

export const web3FormIframe = ({ uri, text }) => {
  const encodedUri = encodeURIComponent(uri || '')
  const encodedText = encodeURIComponent(text || '')
  const randomKey = Math.random().toString(36).substr(2, 9)
  return `
    <iframe
      key="${randomKey}"
      data-key="${randomKey}"
      src="/_assets/web3form.html#w3uri=${encodedUri}&text=${encodedText}&key=${randomKey}"
      class="web3-form-iframe"
      style="width: 100%;"
      loading="lazy"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
    ></iframe>
  `
}

export const createMarkdownRenderer = () => {
  const renderer = new Renderer()
  renderer.image = (href, title, text) => {
    if (isWeb3Uri(href)) {
      return web3FormIframe({ uri: href, text })
    }

    let extraParams = ''
    if (title) {
      const sizeMatch = title.match(/=(\d+)x(\d+)/)
      if (sizeMatch) {
        const [width, height] = sizeMatch.slice(1)
        const actualTitle = title.replace(/=\d+x\d+/, '').trim()
        extraParams = ` title="${actualTitle}" width="${width}" height="${height}"`
      } else {
        extraParams = ` title="${title}"`
        if (href.toLowerCase().endsWith('.pdf')) {
          extraParams += ' width="100%" height="500px"'
        }
      }
    } else if (href.toLowerCase().endsWith('.pdf')) {
      extraParams = ' width="100%" height="500px"'
    }

    switch (mediaType(href)) {
      case 'video':
        return `<video src="${href}" controls${extraParams}>${text}</video>`
      case 'audio':
        return `<audio src="${href}" controls${extraParams}>${text}</audio>`
      case 'application':
        if (href.toLowerCase().endsWith('.pdf')) {
          return `<iframe src="${href}"${extraParams}>Your browser does not support PDF viewing. <a href="${href}" target="_blank">Click here to download the PDF</a></iframe>`
        }
      // Fall through for other application types.
      case 'image':
      default:
        return `<img src="${href}" alt="${text}"${extraParams} />`
    }
  }
  return renderer
}

export const renderMarkdownBody = (markdownContent) => marked(
  markdownContent.replace(FRONTMATTER_REGEX, ''),
  { renderer: createMarkdownRenderer() }
)
