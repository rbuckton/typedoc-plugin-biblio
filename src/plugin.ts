/*!
   Copyright 2019 Ron Buckton

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

import * as path from "path";
import * as ts from "typedoc/node_modules/typescript/lib/typescript";
import { DeclarationReflection, ReflectionKind } from "typedoc";
import { Converter, Context } from "typedoc/dist/lib/converter";
import { ConverterComponent } from "typedoc/dist/lib/converter/components";
import { Component } from "typedoc/dist/lib/output/components";
import { Option } from "typedoc/dist/lib/utils";
import { ParameterType } from "typedoc/dist/lib/utils/options/declaration";

declare module "typedoc/dist/lib/models/reflections/abstract" {
    interface Reflection {
        urlTarget?: string;
    }
}

type NamePath = readonly ts.__String[];

export interface Biblio {
    [key: string]: string;
}

@Component({ name: "biblio" })
export class BiblioPlugin extends ConverterComponent {
    @Option({
        name: "biblio",
        help: "The path to a biblio JSON file, or a biblio object.",
        type: ParameterType.Mixed
    })
    biblio?: string | Biblio;

    initialize() {
        super.initialize();
        this.listenTo(this.owner, Converter.EVENT_RESOLVE_BEGIN, this.onResolveBegin);
    }

    private onResolveBegin(context: Context) {
        const biblio = typeof this.biblio === "string" ? this.loadBiblio(this.biblio) : this.biblio;
        if (!biblio) return;

        const { program, checker } = context;
        const emptySymbols = createSymbolMap([]);
        const sourceFiles = program.getSourceFiles();
        const globalSourceFile = sourceFiles.find(sf => sf.hasNoDefaultLib) || sourceFiles.find(sf => !ts.isExternalModule(sf));
        const globalSymbols = globalSourceFile && createSymbolMap(checker.getSymbolsInScope(globalSourceFile, ~0)) || emptySymbols;
        const globalThisSymbol = getGlobalThisSymbol();
        const moduleSymbolMap = new Map<ts.Symbol, ts.SymbolTable>();

        for (const key in biblio) {
            createBiblioReflection(key, biblio[key]);
        }

        function createSymbolMap(symbols: ts.Symbol[]): ts.SymbolTable {
            return new Map(symbols.map(sym => [sym.escapedName, sym])) as unknown as ts.SymbolTable;
        }

        function createSymbol(flags: ts.SymbolFlags, name: ts.__String) {
            return {
                flags,
                escapedName: name,
                declarations: undefined,
                valueDeclaration: undefined,
                id: undefined,
                mergeId: undefined,
                parent: undefined,
            } as unknown as ts.Symbol;
        }

        function getGlobalThisSymbol() {
            let globalThisSymbol = getSymbol(globalSymbols, "globalThis" as ts.__String, ts.SymbolFlags.ValueModule);
            if (!globalThisSymbol) {
                globalThisSymbol = createSymbol(ts.SymbolFlags.ValueModule, "globalThis" as ts.__String);
                globalThisSymbol.exports = globalSymbols;
            }
            return globalThisSymbol;
        }

        function getModuleSymbol(moduleName: string) {
            moduleName = moduleName.replace(/\\/g, "/");
            moduleName = moduleName.replace(/\.(d\.ts|tsx?|js(x|on)?)$/g, "");
            const escapedModuleName = `"${moduleName}"` as ts.__String;
            return globalSymbols.get(escapedModuleName);
        }

        function getExportsOfModule(moduleSymbol: ts.Symbol | undefined) {
            if (!moduleSymbol) return emptySymbols;
            if (moduleSymbol === globalThisSymbol) return globalSymbols;
            let symbolMap = moduleSymbolMap.get(moduleSymbol);
            if (!symbolMap) moduleSymbolMap.set(moduleSymbol, symbolMap = createSymbolMap(checker.getExportsOfModule(moduleSymbol)));
            return symbolMap;
        }

        function getSymbol(symbols: ts.SymbolTable, name: ts.__String, meaning: ts.SymbolFlags) {
            if (meaning) {
                const symbol = symbols.get(name);
                if (symbol) {
                    if (symbol.flags & meaning) {
                        return symbol;
                    }
                    if (symbol.flags & ts.SymbolFlags.Alias) {
                        const target = checker.getAliasedSymbol(symbol);
                        if (target.flags & meaning) {
                            return symbol;
                        }
                    }
                }
            }
        }

        function resolveName(namePath: NamePath, moduleName: string | undefined, meaning: ts.SymbolFlags) {
            if (meaning && namePath.length) {
                let symbol = moduleName ? getModuleSymbol(moduleName) : globalThisSymbol;
                for (let i = 0; i < namePath.length; i++) {
                    if (!symbol) return;
                    const currentMeaning = i === namePath.length - 1 ? meaning : ts.SymbolFlags.Namespace;
                    symbol = getSymbol(getExportsOfModule(symbol), namePath[i], currentMeaning);
                }
                return symbol;
            }
        }

        // module:name
        // name
        function splitKey(key: string) {
            const parts = key.split(":", 2);
            return parts.reverse() as [string, string?];
        }

        function parseNamePath(name: string): NamePath {
            let entityName = ts.parseIsolatedEntityName(name, ts.ScriptTarget.ESNext);
            if (!entityName) return [];
            const namePath: ts.__String[] = [];
            while (true) {
                if (ts.isIdentifier(entityName)) {
                    namePath.push(entityName.escapedText);
                    return namePath.reverse();
                }
                namePath.push(entityName.right.escapedText);
                entityName = entityName.left;
            }
        }

        function createBiblioReflection(key: string, url: string) {
            const [name, moduleName] = splitKey(key);
            const symbol = resolveName(parseNamePath(name), moduleName, ts.SymbolFlags.Type);
            if (symbol) {
                for (const node of symbol.declarations) {
                    const kind =
                        ts.isInterfaceDeclaration(node) ? ReflectionKind.Interface :
                        ts.isClassDeclaration(node) ? ReflectionKind.Class :
                        ts.isEnumDeclaration(node) ? ReflectionKind.Enum :
                        ts.isModuleDeclaration(node) ? ts.isStringLiteral(node.name) ? ReflectionKind.ExternalModule : ReflectionKind.Module :
                        ts.isTypeAliasDeclaration(node) ? ReflectionKind.TypeAlias :
                        ts.isVariableDeclaration(node) ? ReflectionKind.Variable :
                        undefined;
                    if (kind === undefined) continue;
                    const reflection = new DeclarationReflection(name, kind, context.project);
                    context.registerReflection(reflection, node, symbol);
                    context.trigger(Converter.EVENT_CREATE_DECLARATION, reflection, node);
                    if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
                        context.withScope(reflection, node.typeParameters!, () => {});
                    }
                    if (reflection) {
                        reflection.url = url;
                        reflection.urlTarget = "external";
                    }
                }
            }
        }
    }

    private loadBiblio(biblio: string) {
        try {
            return require(path.resolve(biblio));
        }
        catch (e) {
            this.application.logger.error("Could not load biblio '%s'.", biblio);
        }
    }
}
