import type { server, Program, Node, LeftHandSideExpression } from "typescript";

export interface DiscoveredCall {
  binaryName: string;
  sourceFile: string;
  position: number;
  length: number;
}

export type TsModule = Parameters<server.PluginModuleFactory>[0]["typescript"];

const TARGET_CALL_NAMES = new Set(["convertCliToJs", "fromHelpText"]);
const NODE_MODULES_SEGMENT = "/node_modules/";

const isTargetCallee = (expression: LeftHandSideExpression, tsModule: TsModule): boolean => {
  if (tsModule.isIdentifier(expression)) {
    return TARGET_CALL_NAMES.has(expression.text);
  }
  if (tsModule.isPropertyAccessExpression(expression)) {
    return TARGET_CALL_NAMES.has(expression.name.text);
  }
  return false;
};

export const scanCliCalls = (program: Program, tsModule: TsModule): DiscoveredCall[] => {
  const discoveredCalls: DiscoveredCall[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    if (sourceFile.fileName.includes(NODE_MODULES_SEGMENT)) continue;

    const visitNode = (node: Node): void => {
      if (tsModule.isCallExpression(node) && isTargetCallee(node.expression, tsModule)) {
        const [firstArgument] = node.arguments;
        if (firstArgument && tsModule.isStringLiteralLike(firstArgument)) {
          discoveredCalls.push({
            binaryName: firstArgument.text,
            sourceFile: sourceFile.fileName,
            position: firstArgument.getStart(sourceFile),
            length: firstArgument.getWidth(sourceFile),
          });
        }
      }
      tsModule.forEachChild(node, visitNode);
    };

    tsModule.forEachChild(sourceFile, visitNode);
  }

  return discoveredCalls;
};
