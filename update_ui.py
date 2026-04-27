import sys

def main():
    with open('frontend/app/laboratory/orders/page.tsx', 'r') as f:
        content = f.read()

    # 1. OrderCard: add category badge before age/gender
    old_oc = '                <span>{order.patient.age}y {order.patient.gender}</span>'
    new_oc = '''                {getCategoryDisplay(order.patient) && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-blue-50 text-blue-700 border-blue-200">
                    {getCategoryDisplay(order.patient)}
                  </Badge>
                )}
                <span>{order.patient.age}y {order.patient.gender}</span>'''

    if old_oc in content:
        content = content.replace(old_oc, new_oc)
        print("OrderCard updated")
    else:
        print("ERROR: OrderCard pattern not found")
        return 1

    # 2. Manage Order Dialog: add category and phone after age/gender
    old_md = '''                    <p className="text-xs text-muted-foreground">{selectedOrder.patient.age}y {selectedOrder.patient.gender}</p>
                    {(selectedOrder.patient as any).personal_number && ('''

    new_md = '''                    <p className="text-xs text-muted-foreground">{selectedOrder.patient.age}y {selectedOrder.patient.gender}</p>
                    {selectedOrder.patient?.category && (
                      <p className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">Category:</span>
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700">
                          {getCategoryDisplay(selectedOrder.patient)}
                        </span>
                      </p>
                    )}
                    {selectedOrder.patient?.phone && (
                      <p className="text-xs text-muted-foreground">Phone: <span className="font-mono">{selectedOrder.patient.phone}</span></p>
                    )}
                    {(selectedOrder.patient as any).personal_number && ('''

    if old_md in content:
        content = content.replace(old_md, new_md)
        print("Manage Dialog updated")
    else:
        print("ERROR: Manage Dialog pattern not found")
        return 1

    # 3. Collect Sample Dialog: add category badge and phone after Age/Gender
    old_cd = '''                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Age: {selectedOrder.patient.age}</span>
                        <span>Gender: {selectedOrder.patient.gender}</span>
                      </div>'''

    new_cd = '''                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Age: {selectedOrder.patient.age}</span>
                        <span>Gender: {selectedOrder.patient.gender}</span>
                        {getCategoryDisplay(selectedOrder.patient) && (
                          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700">
                            {getCategoryDisplay(selectedOrder.patient)}
                          </span>
                        )}
                        {selectedOrder.patient?.phone && (
                          <span>Phone: <span className="font-mono">{selectedOrder.patient.phone}</span></span>
                        )}
                      </div>'''

    if old_cd in content:
        content = content.replace(old_cd, new_cd)
        print("Collect Dialog updated")
    else:
        print("ERROR: Collect Dialog pattern not found")
        return 1

    with open('frontend/app/laboratory/orders/page.tsx', 'w') as f:
        f.write(content)

    print("All UI changes applied")
    return 0

if __name__ == '__main__':
    sys.exit(main())
