import fs from 'fs'
import path from 'path'
import { redBright, green, underline, blueBright } from 'chalk'
import matter from 'gray-matter'
import { slugify, nameWithoutOrder } from './util'

function walkDocTree(
    root: string,
    cb: (docPath: string, isChild: boolean) => void,
    dirCb: (dirPath: string) => void = (): void => {/* ignore by default */}
): void {
    for (const category of fs.readdirSync(root)) {
        if (category.startsWith('.') || !fs.statSync(path.join(root, category)).isDirectory())
            continue

        const categoryPath = path.join(root, category)
        for (const doc of fs.readdirSync(categoryPath)) {
            const docPath = path.join(categoryPath, doc)
            if (doc.startsWith('.')) {
                continue
            } else if (doc.endsWith('.md')) {
                cb(docPath, false)
            } else if (!fs.statSync(docPath).isDirectory()) {
                console.warn(`Warning: ${docPath} is not a .md file nor a directory`)
            } else {

                dirCb(docPath)

                for (const child of fs.readdirSync(docPath)) {
                    const childPath = path.join(docPath, child)

                    if (child.startsWith('.')) {
                        continue
                    } else if (child.endsWith('.md')) {
                        cb(childPath, true)
                    }

                }

            }
        }
    }

}

function validateFrontMatter(docPath: string, content: Buffer): boolean {
    const frontmatter = matter(content)
    const { title, hidden } = frontmatter.data
    let passed = true

    for (const key of Object.keys(frontmatter.data)) {
        if (!['title', 'hidden', 'excerpt'].includes(key)) {
            console.log(`Error: ${redBright(docPath)}: invalid frontmatter key ${key}`)
            passed = false
        }
    }

    if (title == null || typeof title !== 'string') {
        console.error(`Error: ${redBright(docPath)}: title missing or invalid`)
        passed = false
    }

    if (hidden != null && typeof hidden !== 'boolean') {
        console.error(`Error: ${redBright(docPath)}: hidden must be true or false`)
        passed = false
    }

    return passed
}

/** Ensure that all files have valid frontmatter */
export function ensureFrontMatter(docs: string): boolean {
    let passed = true

    walkDocTree(docs, (docPath) => {
        passed = passed && validateFrontMatter(docPath, fs.readFileSync(docPath))
    })

    return passed
}

export function ensureUniqueSlugs(docs: string): boolean {
    const slugs = {}
    let passed = true

    walkDocTree(docs, (docPath, isChild) => {
        let parsedPath = path.parse(docPath)

        if (isChild && parsedPath.base === 'index.md') {
            parsedPath = path.parse(parsedPath.dir) // use parent slug
        }

        const slug = slugify(nameWithoutOrder(parsedPath.name))
        if (Object.keys(slugs).includes(slug)) {
            console.error(`Error: ${redBright(docPath)} has the same slug as ${redBright(slugs[slug])}`)
            passed = false
        } else {
            slugs[slug] = docPath
        }
    })

    return passed
}

export function ensureLinksAreValid(docs: string): boolean {
    let passed = true
    const slugs = []
    const link = /\[(?<text>[^)\n]+)\]\(doc:(?<target>[A-Za-z0-9-]+)(#[A-Za-z0-9-]+)?\)/g

    // Step 1: Gather all doc slugs
    walkDocTree(docs, (docPath, isChild) => {
        if (isChild && path.basename(docPath) == 'index.md')
            slugs.push(slugify(nameWithoutOrder(path.parse(path.dirname(docPath)).name)))
        else
            slugs.push(slugify(nameWithoutOrder(path.parse(docPath).name)))
    })

    // Step 2: Check that each link points to a valid slug
    walkDocTree(docs, (docPath) => {
        const contents = fs.readFileSync(docPath).toString()
        for (const match of contents.matchAll(link)) {
            if (!slugs.includes(match.groups.target)) {
                passed = false
                console.error(`Broken link ${underline(blueBright(`[${match.groups.text}](doc:${match.groups.target})`))} in ${green(docPath)}`)
            }
        }
    })

    return passed
}

export function ensureIndexMdExists(docs: string): boolean {
    let passed = true

    walkDocTree(
        docs,
        () => {/* don't care about files */},
        (dir) => { // check dirs
            if (!fs.readdirSync(dir).includes('index.md')) {
                console.error(`Error: "${dir}" has no index.md`)
                passed = false
            }
        }
    )

    return passed
}