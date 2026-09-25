import {prisma} from '@/lib/prisma'
import {serviceUser,ServiceError,serviceError} from '@/lib/support/server'
import {orderCreator} from '@/lib/support/order-owner'
export const dynamic='force-dynamic'
export async function GET(_request:Request,{params}:{params:{entity:string;id:string}}){try{
 const user=await serviceUser()
 if(!['orders','checklists','templates'].includes(params.entity))throw new ServiceError('Proceso desconocido',404)
 const record=await prisma.serviceRecord.findFirst({where:{id:params.id,kind:params.entity}})
 if(!record)throw new ServiceError('Registro no encontrado',404)
 const creatorId=params.entity==='orders'?await orderCreator(prisma,record):record.techId
 if(user.role!=='ADMIN'&&params.entity!=='templates'&&creatorId!==user.id)throw new ServiceError('Registro no encontrado',404)
 return Response.json({...record.payload as object,...(params.entity==='orders'?{createdById:creatorId}:{}),_revision:record.revision})
}catch(error){return serviceError(error)}}
