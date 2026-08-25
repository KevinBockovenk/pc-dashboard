import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { ErrorResponse, HealthStatus, PcCommandInput, PcCommandResult, PcListResponse } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
/**
 * Returns server health status
 * @summary Health check
 */
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListPcsUrl: () => string;
/**
 * Returns all currently connected PCs
 * @summary List connected PCs
 */
export declare const listPcs: (options?: RequestInit) => Promise<PcListResponse>;
export declare const getListPcsQueryKey: () => readonly ["/api/pcs"];
export declare const getListPcsQueryOptions: <TData = Awaited<ReturnType<typeof listPcs>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listPcs>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listPcs>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListPcsQueryResult = NonNullable<Awaited<ReturnType<typeof listPcs>>>;
export type ListPcsQueryError = ErrorType<unknown>;
/**
 * @summary List connected PCs
 */
export declare function useListPcs<TData = Awaited<ReturnType<typeof listPcs>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listPcs>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getSendPcCommandUrl: (pcName: string) => string;
/**
 * Sends a command to the specified PC and returns the result
 * @summary Send a command to a PC
 */
export declare const sendPcCommand: (pcName: string, pcCommandInput: PcCommandInput, options?: RequestInit) => Promise<PcCommandResult>;
export declare const getSendPcCommandMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof sendPcCommand>>, TError, {
        pcName: string;
        data: BodyType<PcCommandInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof sendPcCommand>>, TError, {
    pcName: string;
    data: BodyType<PcCommandInput>;
}, TContext>;
export type SendPcCommandMutationResult = NonNullable<Awaited<ReturnType<typeof sendPcCommand>>>;
export type SendPcCommandMutationBody = BodyType<PcCommandInput>;
export type SendPcCommandMutationError = ErrorType<ErrorResponse>;
/**
* @summary Send a command to a PC
*/
export declare const useSendPcCommand: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof sendPcCommand>>, TError, {
        pcName: string;
        data: BodyType<PcCommandInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof sendPcCommand>>, TError, {
    pcName: string;
    data: BodyType<PcCommandInput>;
}, TContext>;
export {};
//# sourceMappingURL=api.d.ts.map