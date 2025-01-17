/// <reference path='../typings/marked/marked.d.ts' />
/// <reference path='../built/pxtarget.d.ts' />
/// <reference path="emitter/util.ts"/>

namespace pxt.docs {
    declare var require: any;
    let marked: MarkedStatic;
    import U = pxtc.Util;
    const lf = U.lf;

    let stdboxes: Map<string> = {
    }

    let stdmacros: Map<string> = {
    }

    const stdSetting = "<!-- @CMD@ @ARGS@ -->"

    let stdsettings: Map<string> = {
        "parent": stdSetting,
        "short": stdSetting,
        "description": "<!-- desc -->"
    }

    function replaceAll(replIn: string, x: string, y: string) {
        return replIn.split(x).join(y)
    }

    export function htmlQuote(s: string): string {
        s = replaceAll(s, "&", "&amp;")
        s = replaceAll(s, "<", "&lt;")
        s = replaceAll(s, ">", "&gt;")
        s = replaceAll(s, "\"", "&quot;")
        s = replaceAll(s, "\'", "&#39;")
        return s;
    }

    // the input already should be HTML-quoted but we want to make sure, and also quote quotes
    export function html2Quote(s: string) {
        return htmlQuote(s.replace(/\&([#a-z0-9A-Z]+);/g, (f, ent) => {
            switch (ent) {
                case "amp": return "&";
                case "lt": return "<";
                case "gt": return ">";
                case "quot": return "\"";
                default:
                    if (ent[0] == "#")
                        return String.fromCharCode(parseInt(ent.slice(1)));
                    else return f
            }
        }))
    }

    interface CmdLink {
        rx: RegExp;
        cmd: string;
    }

    //The extra YouTube macros are in case there is a timestamp on the YouTube URL.
    //TODO: Add equivalent support for youtu.be links
    let links: CmdLink[] = [
        {
            rx: /^vimeo\.com\/(\d+)/,
            cmd: "### @vimeo $1"
        },
        {
            rx: /^(www\.youtube\.com\/watch\?v=|youtu\.be\/)([\w\-]+(\#t=([0-9]+m[0-9]+s|[0-9]+m|[0-9]+s))?)/,
            cmd: "### @youtube $2"
        }
    ]

    export interface BreadcrumbEntry {
        name: string;
        href: string;
    }

    export var requireMarked = () => {
        if (typeof marked !== "undefined") return marked;
        if (typeof require === "undefined") return undefined;
        return require("marked");
    }

    export interface RenderData {
        html: string;
        theme: AppTheme;
        params: Map<string>;
        breadcrumb?: BreadcrumbEntry[];
        filepath?: string;

        finish?: () => string;
        boxes?: Map<string>;
        macros?: Map<string>;
        settings?: Map<string>;
    }

    function parseHtmlAttrs(s: string) {
        let attrs: Map<string> = {};
        while (s.trim()) {
            let m = /\s*([^=\s]+)=("([^"]*)"|'([^']*)'|(\S*))/.exec(s)
            if (m) {
                let v = m[3] || m[4] || m[5] || ""
                attrs[m[1].toLowerCase()] = v
            } else {
                m = /^\s*(\S+)/.exec(s)
                attrs[m[1]] = "true"
            }
            s = s.slice(m[0].length)
        }
        return attrs
    }

    let error = (s: string) =>
        `<div class='ui negative message'>${htmlQuote(s)}</div>`

    export function prepTemplate(d: RenderData) {
        let boxes = U.clone(stdboxes)
        let macros = U.clone(stdmacros)
        let settings = U.clone(stdsettings)
        let menus: Map<string> = {}
        let params = d.params
        let theme = d.theme

        d.boxes = boxes
        d.macros = macros
        d.settings = settings

        d.html = d.html.replace(/<aside\s+([^<>]+)>([^]*?)<\/aside>/g, (full, attrsStr, body) => {
            let attrs = parseHtmlAttrs(attrsStr)
            let name = attrs["data-name"] || attrs["id"]

            if (!name)
                return error("id or data-name missing on macro")
            if (/box/.test(attrs["class"])) {
                boxes[name] = body
            } else if (/aside/.test(attrs["class"])) {
                boxes[name] = `<!-- BEGIN-ASIDE ${name} -->${body}<!-- END-ASIDE -->`
            } else if (/setting/.test(attrs["class"])) {
                settings[name] = body
            } else if (/menu/.test(attrs["class"])) {
                menus[name] = body
            } else {
                macros[name] = body
            }
            return `<!-- macro ${name} -->`
        })

        let recMenu = (m: DocMenuEntry, lev: number) => {
            let templ = menus["item"]
            let mparams: Map<string> = {
                NAME: m.name,
            }
            if (m.subitems) {
                if (lev == 0) templ = menus["top-dropdown"]
                else templ = menus["inner-dropdown"]
                mparams["ITEMS"] = m.subitems.map(e => recMenu(e, lev + 1)).join("\n")
            } else {
                if (/^-+$/.test(m.name)) {
                    templ = menus["divider"]
                }
                if (m.path && !/^(https?:|\/)/.test(m.path))
                    return error("Invalid link: " + m.path)
                mparams["LINK"] = m.path
            }
            return injectHtml(templ, mparams, ["ITEMS"])
        }

        let breadcrumbHtml = '';
        if (d.breadcrumb && d.breadcrumb.length > 1) {
            breadcrumbHtml = `
            <div class="ui breadcrumb">
                ${d.breadcrumb.map((b, i) =>
                    `<a class="${i == d.breadcrumb.length - 1 ? "active" : ""} section" 
                        href="${html2Quote(b.href)}">${html2Quote(b.name)}</a>`)
                    .join('<i class="right chevron icon divider"></i>')}
            </div>`;
        }
        params["menu"] = (theme.docMenu || []).map(e => recMenu(e, 0)).join("\n")
        params["breadcrumb"] = breadcrumbHtml;
        params["targetname"] = theme.name || "PXT"
        params["targetlogo"] = theme.docsLogo ? `<img class="ui mini image" src="${U.toDataUri(theme.docsLogo)}" />` : ""
        if (d.filepath && theme.githubUrl) {
            //I would have used NodeJS path library, but this code may have to work in browser
            let leadingTrailingSlash = /^\/|\/$/;
            let githubUrl = `${theme.githubUrl.replace(leadingTrailingSlash, '')}/blob/master/docs/${d.filepath.replace(leadingTrailingSlash, '')}`;
            params["github"] = `<p style="margin-top:1em"><a href="${githubUrl}"><i class="write icon"></i>${lf("Edit this page on GitHub")}</a></p>`;
        }
        else {
            params["github"] = "";
        }

        let style = '';
        if (theme.accentColor) style += `
.ui.accent { color: ${theme.accentColor}; }
.ui.inverted.accent { background: ${theme.accentColor}; }
`
        params["targetstyle"] = style;

        for (let k of Object.keys(theme)) {
            let v = (theme as any)[k]
            if (params[k] === undefined && typeof v == "string")
                params[k] = v
        }

        d.finish = () => injectHtml(d.html, params,
            ["body", "menu", "breadcrumb", "targetlogo", "github"])
    }

    export function renderMarkdown(template: string, src: string,
        theme: AppTheme = {}, pubinfo: Map<string> = null,
        breadcrumb: BreadcrumbEntry[] = [], filepath: string = null): string {

        let params: Map<string> = pubinfo || {}

        template = template
            .replace(/<!--\s*@include\s+(\S+)\s*-->/g,
            (full, fn) => {
                let cont = (theme.htmlDocIncludes || {})[fn] || ""
                return "<!-- include " + fn + " -->\n" + cont + "\n<!-- end include -->\n"
            })

        let d: RenderData = {
            html: template,
            theme: theme,
            params: params,
            breadcrumb: breadcrumb,
            filepath: filepath
        }
        prepTemplate(d)

        if (!marked) {
            marked = requireMarked();
            let renderer = new marked.Renderer()
            renderer.image = function (href: string, title: string, text: string) {
                let out = '<img class="ui image" src="' + href + '" alt="' + text + '"';
                if (title) {
                    out += ' title="' + title + '"';
                }
                out += this.options.xhtml ? '/>' : '>';
                return out;
            }
            marked.setOptions({
                renderer: renderer,
                gfm: true,
                tables: true,
                breaks: false,
                pedantic: false,
                sanitize: true,
                smartLists: true,
                smartypants: true,
                highlight: function (code, lang) {
                    try {
                        let hljs = require('highlight.js');
                        if (!hljs) return code;
                        return hljs.highlightAuto(code, [lang.replace('-ignore', '')]).value;
                    }
                    catch (e) {
                        return code;
                    }
                }
            })
        };

        //Uses the CmdLink definitions to replace links to YouTube and Vimeo (limited at the moment)
        src = src.replace(/^\s*https?:\/\/(\S+)\s*$/mg, (f, lnk) => {
            for (let ent of links) {
                let m = ent.rx.exec(lnk)
                if (m) {
                    return ent.cmd.replace(/\$(\d+)/g, (f, k) => {
                        return m[parseInt(k)] || ""
                    }) + "\n"
                }
            }
            return f
        })

        let html = marked(src)

        // support for breaks which somehow don't work out of the box
        html = html.replace(/&lt;br\s*\/&gt;/ig, "<br/>");

        let endBox = ""

        html = html.replace(/<h\d[^>]+>\s*([~@])\s*(.*?)<\/h\d>/g, (f, tp, body) => {
            let m = /^(\w+)\s+(.*)/.exec(body)
            let cmd = m ? m[1] : body
            let args = m ? m[2] : ""
            let rawArgs = args
            args = html2Quote(args)
            cmd = html2Quote(cmd)
            if (tp == "@") {
                let expansion = U.lookup(d.settings, cmd)
                if (expansion != null) {
                    params[cmd] = args
                } else {
                    expansion = U.lookup(d.macros, cmd)
                    if (expansion == null)
                        return error(`Unknown command: @${cmd}`)
                }

                let ivars: Map<string> = {
                    ARGS: args,
                    CMD: cmd
                }

                return injectHtml(expansion, ivars, ["ARGS", "CMD"])
            } else {
                if (!cmd) {
                    let r = endBox
                    endBox = ""
                    return r
                }

                let box = U.lookup(d.boxes, cmd)
                if (box) {
                    let parts = box.split("@BODY@")
                    endBox = parts[1]
                    return parts[0].replace("@ARGS@", args)
                } else {
                    return error(`Unknown box: ~${cmd}`)
                }
            }
        })

        if (!params["title"]) {
            let titleM = /<h1[^<>]*>([^<>]+)<\/h1>/.exec(html)
            if (titleM)
                params["title"] = html2Quote(titleM[1])
        }

        if (!params["description"]) {
            let descM = /<p>([^]+?)<\/p>/.exec(html)
            if (descM)
                params["description"] = html2Quote(descM[1])
        }

        let registers: Map<string> = {}
        registers["main"] = "" // first

        html = html.replace(/<!-- BEGIN-ASIDE (\S+) -->([^]*?)<!-- END-ASIDE -->/g, (f, nam, cont) => {
            let s = U.lookup(registers, nam)
            registers[nam] = (s || "") + cont
            return "<!-- aside -->"
        })

        // fix up spourious newlines at the end of code blocks
        html = html.replace(/\n<\/code>/g, "</code>")

        registers["main"] = html

        let injectBody = (tmpl: string, body: string) =>
            injectHtml(d.boxes[tmpl] || "@BODY@", { BODY: body }, ["BODY"])

        html = ""

        for (let k of Object.keys(registers)) {
            html += injectBody(k + "-container", registers[k])
        }

        params["body"] = html
        params["name"] = params["title"] + " - " + params["targetname"]

        return d.finish()
    }

    function injectHtml(template: string, vars: Map<string>, quoted: string[] = []) {
        if (!template) return '';

        return template.replace(/@(\w+)@/g, (f, key) => {
            let res = U.lookup(vars, key) || "";
            res += ""; // make sure it's a string
            if (quoted.indexOf(key) < 0) {
                res = html2Quote(res);
            }
            return res;
        });
    }

    export function embedUrl(rootUrl: string, tag: string, id: string, height?: number): string {
        const url = `${rootUrl}#${tag}:${id}`;
        let padding = '70%';
        return `<div style="position:relative;height:0;padding-bottom:${padding};overflow:hidden;"><iframe style="position:absolute;top:0;left:0;width:100%;height:100%;" src="${url}" frameborder="0" sandbox="allow-scripts allow-same-origin"></iframe></div>`;
    }

    export function runUrl(url: string, padding: string, id: string): string {
        let embed = `<div style="position:relative;height:0;padding-bottom:${padding};overflow:hidden;"><iframe style="position:absolute;top:0;left:0;width:100%;height:100%;" src="${url}?id=${encodeURIComponent(id)}" allowfullscreen="allowfullscreen" sandbox="allow-scripts allow-same-origin" frameborder="0"></iframe></div>`;
        return embed;
    }

    export function docsEmbedUrl(rootUrl: string, id: string, height?: number): string {
        const docurl = `${rootUrl}--docs?projectid=${id}`;
        height = Math.ceil(height || 300);
        return `<div style="position:relative;height:calc(${height}px + 5em);width:100%;overflow:hidden;"><iframe style="position:absolute;top:0;left:0;width:100%;height:100%;" src="${docurl}" allowfullscreen="allowfullscreen" frameborder="0" sandbox="allow-scripts allow-same-origin"></iframe></div>`
    }
}
